import { fireEvent, screen, within } from '@testing-library/vue';
import { dartEvent, hit } from '@treblewise/core';
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

function startMatch(overrides: Partial<typeof config> = {}) {
  const settings = useSettingsStore();
  settings.settings = { ...settings.settings, entryMode: 'keypad', soundsEnabled: false, callerEnabled: false };
  useMatchesStore().start({ ...config, ...overrides });
}

const visits = () => screen.getByRole('region', { name: /visits/i });

describe('the game screen', () => {
  it('corrects any dart of the leg from the visits, not only the last visit', async () => {
    await renderAt('/game', () => {
      startMatch();
      const matches = useMatchesStore();
      matches.throwDart(hit(20, 'treble'));
      matches.throwDart(hit(20, 'treble'));
      matches.throwDart(hit(5, 'single')); // meant to be a treble 20
      matches.throwDart(hit(19, 'single')); // Bob has started his visit
    });

    await fireEvent.click(within(visits()).getByRole('button', { name: /^S5\b/ }));
    expect(screen.getByRole('heading', { name: /correcting/i })).toBeDefined();
    await fireEvent.click(screen.getByRole('radio', { name: /treble/i }));
    await fireEvent.click(screen.getByRole('button', { name: '20' }));

    const snapshot = useMatchesStore().snapshot!;
    expect(snapshot.legs[0]!.remaining.ann).toBe(501 - 180);
    // Still Bob's visit: a correction enters no dart.
    expect(snapshot.current!.playerId).toBe('bob');
    // The corrected dart says what it was.
    expect(within(visits()).getByText('S5').tagName).toBe('S');
  });

  it('names each dart in notation on its card, and writes the checkout into the waiting slots', async () => {
    await renderAt('/game', () => startMatch({ startScore: 101, players: [{ id: 'ann', name: 'Ann' }] }));
    await fireEvent.click(screen.getByRole('button', { name: '1' }));

    const slots = document.querySelector('.dart-slots') as HTMLElement;
    expect(within(slots).getByRole('button', { name: /^1: S1\b/ })).toBeDefined();
    // 100 left with two darts: T20, then D20.
    expect(within(slots).getAllByText(/aim/i)).toHaveLength(2);
    expect(within(slots).getByText('T20')).toBeDefined();
    expect(within(slots).getByText('D20')).toBeDefined();
    expect(screen.getByRole('heading', { name: /ann, you require 100/i })).toBeDefined();
  });

  it('keeps the caller, the names and the sounds behind the speaker, the names only while the caller is on', async () => {
    await renderAt('/game', () => startMatch());
    await fireEvent.click(screen.getByRole('button', { name: /the caller and sounds/i }));
    expect(screen.queryByRole('switch', { name: /say the names/i })).toBeNull();

    await fireEvent.click(screen.getByRole('switch', { name: /^caller/i }));
    expect(useSettingsStore().settings.callerEnabled).toBe(true);
    const names = screen.getByRole('switch', { name: /say the names/i });
    await fireEvent.click(names);
    expect(useSettingsStore().settings.callNames).toBe(false);
    expect(names.getAttribute('aria-checked')).toBe('false');
  });

  it('colours the leg average against the usual one, and leaves a guest plain', async () => {
    await renderAt('/game', () => {
      const matches = useMatchesStore();
      // Ann averaged 60 before: three visits of 20, 20, 20.
      const before = Array.from({ length: 9 }, (_, i) => dartEvent(hit(20, 'single'), { id: `old-${i}`, ts: i }));
      matches.history = [
        { id: 'old', createdAt: 0, updatedAt: 0, finished: true, events: before, config: { ...config, players: [{ id: 'ann', name: 'Ann' }] } },
      ];
      startMatch({ players: [{ id: 'ann', name: 'Ann' }, { id: 'guest', name: 'Guest', temporary: true } as never] });
      matches.throwDart(hit(20, 'treble'));
      matches.throwDart(hit(20, 'treble'));
      matches.throwDart(hit(20, 'single'));
    });
    const ann = screen.getByText('Ann', { selector: '.player-card-name' }).closest('.player-card') as HTMLElement;
    // 140 in a visit against a usual 60.
    expect(within(ann).getByText('140.0')).toBeDefined();
    expect(within(ann).getByText('▲ +80.0')).toBeDefined();
    expect(within(ann).getByText('average 60.0')).toBeDefined();
    expect((within(ann).getByText('140.0') as HTMLElement).style.color).not.toBe('');

    const guest = screen.getByText('Guest', { selector: '.player-card-name' }).closest('.player-card') as HTMLElement;
    expect(within(guest).queryByText(/average \d/)).toBeNull();
    expect(within(guest).queryByText(/[▲▼≈]/)).toBeNull();
  });

  it('switches between the board and the keypad with one button', async () => {
    await renderAt('/game', () => startMatch());
    expect(screen.getByRole('button', { name: '20' })).toBeDefined();
    await fireEvent.click(screen.getByRole('button', { name: /switch to tapping the board/i }));
    expect(useSettingsStore().settings.entryMode).toBe('board');
    expect(screen.getByRole('button', { name: 'Dartboard' })).toBeDefined();
    expect(screen.getByRole('button', { name: /switch to the keypad/i })).toBeDefined();
  });

  it('scores a visit from the keypad and passes the throw', async () => {
    await renderAt('/game', () => startMatch());
    for (let n = 0; n < 3; n += 1) {
      await fireEvent.click(screen.getByRole('radio', { name: /treble/i }));
      await fireEvent.click(screen.getByRole('button', { name: '20' }));
    }
    expect(screen.getAllByText('321')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: /bob to throw/i })).toBeDefined();
    // The title carries the score in legs.
    expect(screen.getByText('501 · First to 1 leg · 0–0')).toBeDefined();
  });

  it('hides the visits, and brings them back from the edge', async () => {
    await renderAt('/game', () => startMatch());
    await fireEvent.click(screen.getByRole('button', { name: /hide the visits/i }));
    expect(screen.queryByRole('region', { name: /visits/i })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /show the visits/i }));
    expect(visits()).toBeDefined();
  });

  it('offers a new match once it is won', async () => {
    const { router } = await renderAt('/game', () => startMatch({ startScore: 301, players: [{ id: 'ann', name: 'Ann' }] }));
    const matches = useMatchesStore();
    // 180, then 60 + 33 + a double 14: 301 checked out.
    for (const dart of [hit(20, 'treble'), hit(20, 'treble'), hit(20, 'treble'), hit(20, 'treble'), hit(11, 'treble'), hit(14, 'double')]) {
      matches.throwDart(dart);
    }
    const won = (await screen.findByRole('heading', { name: /wins the match/i })).closest('.overlay-card') as HTMLElement;
    await fireEvent.click(within(won).getByRole('button', { name: /new match/i }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/setup'));
  });

  it('has fullscreen in the corner, not in the match, and the footer under the match', async () => {
    const { restore } = fakeFullscreen();
    try {
      await renderAt('/game', () => startMatch());
      const button = screen.getByRole('button', { name: 'Fullscreen' });
      expect(button.classList).toContain('app-fullscreen');
      expect(button.closest('.game')).toBeNull();
      const footer = screen.getByRole('contentinfo');
      const match = document.querySelector('.game')!;
      expect(match.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    } finally {
      restore();
    }
  });
});
