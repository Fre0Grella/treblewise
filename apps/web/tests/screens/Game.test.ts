import { fireEvent, screen, within } from '@testing-library/vue';
import { hit } from '@treblewise/core';
import { describe, expect, it, vi } from 'vitest';

import { useMatchesStore, useSettingsStore } from '@/store/stores.js';
import { fakeFullscreen } from '../support/fullscreen.js';
import { renderAt } from '../support/renderAt.js';

// No camera here: the game screen alone.
vi.mock('@/vision/camera.js', () => ({ cameraSupported: () => false, THUMB_SIZE: 64 }));
vi.mock('@/vision/detector.js', () => ({ loadManifest: async () => null, loadDetector: async () => null }));

const config = {
  startScore: 501,
  inRule: 'straight' as const,
  outRule: 'double' as const,
  legsPerSet: 1,
  setsToWin: 1,
  players: [
    { id: 'ann', name: 'Ann' },
    { id: 'bob', name: 'Bob' },
  ],
};

function startMatch() {
  const settings = useSettingsStore();
  settings.settings = { ...settings.settings, entryMode: 'keypad', soundsEnabled: false, callerEnabled: false };
  useMatchesStore().start(config);
}

describe('the game screen', () => {
  it('keeps the visit just thrown correctable, third dart included, until the next player throws', async () => {
    await renderAt('/game', () => {
      startMatch();
      const matches = useMatchesStore();
      matches.throwDart(hit(20, 'treble'));
      matches.throwDart(hit(20, 'treble'));
      matches.throwDart(hit(5, 'single')); // meant to be a treble 20
    });

    const last = screen.getByText(/ann, just thrown/i).closest('.throw-strip') as HTMLElement;
    await fireEvent.click(within(last).getByRole('button', { name: 'S5' }));
    await fireEvent.click(screen.getByRole('radio', { name: /treble/i }));
    await fireEvent.click(screen.getByRole('button', { name: '20' }));

    const snapshot = useMatchesStore().snapshot!;
    expect(snapshot.legs[0]!.remaining.ann).toBe(501 - 180);
    expect(snapshot.current!.playerId).toBe('bob');

    // Bob throws: Ann's visit is no longer offered.
    await fireEvent.click(screen.getByRole('button', { name: '19' }));
    expect(screen.queryByText(/ann, just thrown/i)).toBeNull();
  });

  it('lets the names be left out of the calls, while the caller is on', async () => {
    await renderAt('/game', startMatch);
    expect(screen.queryByRole('button', { name: /names/i })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Caller off' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Names on' }));
    expect(useSettingsStore().settings.callNames).toBe(false);
    expect(screen.getByRole('button', { name: 'Names off' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('scores a visit from the keypad and passes the throw', async () => {
    await renderAt('/game', startMatch);
    for (let n = 0; n < 3; n += 1) {
      await fireEvent.click(screen.getByRole('radio', { name: /treble/i }));
      await fireEvent.click(screen.getByRole('button', { name: '20' }));
    }
    expect(screen.getAllByText('321')).toHaveLength(1);
    expect(screen.getByText(/bob to throw/i)).toBeDefined();
  });

  it('offers a new match once it is won', async () => {
    const { router } = await renderAt('/game', () => {
      const settings = useSettingsStore();
      settings.settings = { ...settings.settings, entryMode: 'keypad', soundsEnabled: false, callerEnabled: false };
      useMatchesStore().start({ ...config, startScore: 301, players: [{ id: 'ann', name: 'Ann' }] });
    });
    const matches = useMatchesStore();
    // 180, then 60 + 33 + a double 14: 301 checked out.
    for (const dart of [hit(20, 'treble'), hit(20, 'treble'), hit(20, 'treble'), hit(20, 'treble'), hit(11, 'treble'), hit(14, 'double')]) {
      matches.throwDart(dart);
    }
    const won = (await screen.findByRole('heading', { name: /wins the match/i })).closest('.overlay-card') as HTMLElement;
    await fireEvent.click(within(won).getByRole('button', { name: /new match/i }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/setup'));
  });

  it('has fullscreen beside the caller and the sounds, and no footer', async () => {
    const { restore } = fakeFullscreen();
    try {
      await renderAt('/game', startMatch);
      const button = screen.getByRole('button', { name: 'Fullscreen' });
      expect(button.closest('.controls')).toBe(screen.getByRole('button', { name: 'Caller off' }).closest('.controls'));
      // Every pixel goes to the board.
      expect(screen.queryByRole('contentinfo')).toBeNull();
    } finally {
      restore();
    }
  });
});
