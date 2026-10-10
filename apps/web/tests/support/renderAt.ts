/**
 * The app opened at an address, for a test: fresh stores, a router with its
 * history in memory, and the screen that address shows.
 */

import { render } from '@testing-library/vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { createMemoryHistory, type RouterHistory } from 'vue-router';

import App from '@/App.vue';
import { createAppRouter } from '@/router/index.js';

/**
 * `prepare` runs with the stores in place and before anything renders: it
 * sets up what the test needs (a session, a match in progress). With
 * `keepStores`, the stores the test has already filled are used as they are.
 * `history` replaces the in-memory one, for a test of what only the browser's
 * history records (the page before this one).
 */
export async function renderAt(
  path: string,
  prepare?: () => void,
  { keepStores = false, history }: { keepStores?: boolean; history?: RouterHistory } = {},
) {
  const pinia = (keepStores && getActivePinia()) || createPinia();
  setActivePinia(pinia);
  prepare?.();
  const router = createAppRouter(history ?? createMemoryHistory());
  // Every screen loaded up front: in a busy test run, a screen's first lazy
  // load can outlast a test's wait for the navigation it causes.
  await Promise.all(
    router.getRoutes().map((route) => {
      const screen = route.components?.default;
      return typeof screen === 'function' ? (screen as () => Promise<unknown>)() : null;
    }),
  );
  await router.push(path);
  await router.isReady();
  const rendered = render(App, { global: { plugins: [pinia, router] } });
  // Lazy screens resolve on a later tick.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { ...rendered, router };
}
