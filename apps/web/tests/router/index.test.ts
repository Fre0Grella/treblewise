import { describe, expect, it } from 'vitest';

import { useMatchesStore } from '@/store/stores.js';
import { redirectOldHash } from '@/router/index.js';
import { renderAt } from '../support/renderAt.js';

describe('the router', () => {
  it('opens the setup at the game address when no match is in progress', async () => {
    const { router } = await renderAt('/game');
    expect(router.currentRoute.value.path).toBe('/setup');
  });

  it('opens the game when there is a match to resume', async () => {
    const { router } = await renderAt('/game', () => {
      useMatchesStore().match = { id: 'm', createdAt: 0, updatedAt: 0, finished: false, events: [], config: {} as never };
    });
    expect(router.currentRoute.value.path).toBe('/game');
  });

  it('sends an unknown address to the landing page', async () => {
    const { router } = await renderAt('/nowhere/at/all');
    expect(router.currentRoute.value.path).toBe('/');
  });

  it.each([
    ['#/phone', '/pair/phone'],
    ['#/pair', '/pair/laptop'],
    ['#/new', '/setup'],
    ['#/', '/'],
  ])('turns an old bookmark %s into %s before the router reads it', (hash, path) => {
    history.replaceState(null, '', `/${hash}`);
    redirectOldHash();
    expect(location.pathname).toBe(path);
    expect(location.hash).toBe('');
  });

  it('leaves an address with no old hash alone', () => {
    history.replaceState(null, '', '/stats');
    redirectOldHash();
    expect(location.pathname).toBe('/stats');
  });
});
