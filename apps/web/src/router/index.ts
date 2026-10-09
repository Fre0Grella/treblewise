/**
 * The router: one route per screen, at the addresses in paths.ts.
 *
 * Every screen is loaded when it is first opened, so the first page a visitor
 * sees does not carry the camera, the model's runtime or the charts.
 */

import { createRouter, createWebHistory, type RouterHistory, type RouteRecordRaw } from 'vue-router';

import { useMatchesStore } from '../store/stores.js';
import { PATHS, pathForOldHash, type RouteName } from './paths.js';

const SCREENS: Record<RouteName, () => Promise<unknown>> = {
  landing: () => import('../screens/Landing.vue'),
  start: () => import('../screens/Start.vue'),
  lobby: () => import('../screens/Lobby.vue'),
  setup: () => import('../screens/Setup.vue'),
  history: () => import('../screens/History.vue'),
  match: () => import('../screens/History.vue'),
  stats: () => import('../screens/Stats.vue'),
  game: () => import('../screens/Game.vue'),
  review: () => import('../screens/Review.vue'),
  photo: () => import('../screens/Review.vue'),
  camera: () => import('../screens/Capture.vue'),
  pair: () => import('../screens/pair/PairRole.vue'),
  pairLaptop: () => import('../screens/pair/PairLaptop.vue'),
  pairPhone: () => import('../screens/pair/PairPhone.vue'),
};

const routes: RouteRecordRaw[] = (Object.keys(PATHS) as RouteName[]).map((name) => ({
  name,
  path: PATHS[name],
  component: SCREENS[name],
}));

export function createAppRouter(history: RouterHistory = createWebHistory(import.meta.env.BASE_URL)) {
  const router = createRouter({
    history,
    routes: [...routes, { path: '/:unknown(.*)*', redirect: PATHS.landing }],
    scrollBehavior: () => ({ top: 0 }),
  });

  // A match is resumed, never invented: with none in progress, the game's
  // address opens the setup instead.
  router.beforeEach((to) => {
    if (to.name === 'game' && !useMatchesStore().match) return PATHS.setup;
    return true;
  });

  return router;
}

/**
 * An old `#/…` bookmark becomes its address, before the router reads the
 * location: it then lands on the same screen.
 */
export function redirectOldHash(): void {
  const path = pathForOldHash(location.hash);
  if (path) history.replaceState(null, '', `${import.meta.env.BASE_URL}${path.slice(1)}`);
}
