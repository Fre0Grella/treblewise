import { fireEvent, screen, within } from '@testing-library/vue';
import type { ModeConfig } from '@treblewise/core';
import { describe, expect, it, vi } from 'vitest';

import { useMatchesStore, useSettingsStore } from '@/store/stores.js';
import { renderAt } from '../support/renderAt.js';

// No camera here: the game screen alone.
vi.mock('@/vision/camera.js', () => ({ cameraSupported: () => false, THUMB_SIZE: 64 }));
vi.mock('@/vision/detector.js', () => ({ loadManifest: async () => null, loadDetector: async () => null }));

const ann = { id: 'ann', name: 'Ann' };
const bob = { id: 'bob', name: 'Bob' };

function start(config: ModeConfig) {
  const settings = useSettingsStore();
  settings.settings = { ...settings.settings, entryMode: 'keypad', soundsEnabled: false, callerEnabled: false };
  useMatchesStore().start(config);
}

const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const ring = (name: RegExp) => fireEvent.click(screen.getByRole('radio', { name }));

describe('the screen of the other games', () => {
  it('chalks cricket marks up on the board', async () => {
    await renderAt('/game', () => start({ mode: 'cricket', scoring: 'standard', legsToWin: 1, players: [ann, bob] }));
    const board = screen.getByRole('region', { name: 'Cricket' });
    expect(within(board).getByLabelText('Ann, 20: 0 marks')).toBeDefined();

    await ring(/treble/i);
    await press('20');
    expect(within(board).getByLabelText('Ann, 20: Done')).toBeDefined();
    await ring(/double/i);
    await press('20');
    // Two marks past the third: 40 points, Bob still open on the 20.
    expect(useMatchesStore().snapshot!.legs[0]!.remaining.ann).toBe(40);
    expect(within(board).getByText('40')).toBeDefined();
  });

  it('shows the target around the clock, and moves it on a hit', async () => {
    await renderAt('/game', () =>
      start({ mode: 'aroundTheClock', ring: 'any', order: 'up', bull: false, hitsPerTarget: 1, multiples: false, legsToWin: 1, players: [ann] }),
    );
    expect(screen.getByRole('heading', { name: 'Ann, aim at 1' })).toBeDefined();
    await press('1');
    expect(screen.getByRole('heading', { name: 'Ann, aim at 2' })).toBeDefined();
    const slots = document.querySelector('.dart-slots') as HTMLElement;
    expect(within(slots).getByText('S2')).toBeDefined();
  });

  it('ends a drill with its score, and starts it again', async () => {
    await renderAt('/game', () => start({ mode: 'countUp', rounds: 1, legsToWin: 1, players: [ann] }));
    await ring(/treble/i);
    await press('20');
    await ring(/treble/i);
    await press('20');
    await ring(/treble/i);
    await press('20');
    const result = await screen.findByRole('dialog', { name: 'Finished on 180' });
    expect(within(result).getByText('3-dart average')).toBeDefined();
    expect(useMatchesStore().match!.finished).toBe(true);

    await fireEvent.click(within(result).getByRole('button', { name: /rematch/i }));
    expect(useMatchesStore().snapshot!.current).toMatchObject({ playerId: 'ann', round: 1 });
  });

  it('has the rules in the menu', async () => {
    await renderAt('/game', () => start({ mode: 'shanghai', rounds: 7, shanghaiWins: true, legsToWin: 1, players: [ann] }));
    await press(/^menu$/i);
    await press(/how to play shanghai/i);
    const rules = screen.getByRole('dialog', { name: /how to play shanghai/i });
    await fireEvent.click(within(rules).getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog', { name: /how to play/i })).toBeNull();
  });

  it('plays teams: the team on the board, its players under the name, the one at the oche named', async () => {
    const people = ['Marco', 'Giulia', 'Dave', 'Anna'].map((name) => ({ id: name.toLowerCase(), name }));
    await renderAt('/game', () =>
      start({
        mode: 'cricket',
        scoring: 'standard',
        legsToWin: 1,
        players: people,
        teams: [
          { id: 't1', name: 'Team 1', members: ['marco', 'giulia'] },
          { id: 't2', name: 'Team 2', members: ['dave', 'anna'] },
        ],
      }),
    );
    expect(screen.getByRole('heading', { name: 'Marco (Team 1) to throw' })).toBeDefined();
    const board = screen.getByRole('region', { name: 'Cricket' });
    expect(within(board).getByText('Team 1')).toBeDefined();
    expect(within(board).getByText('Marco').getAttribute('aria-current')).toBe('true');

    for (let i = 0; i < 3; i += 1) await press('Miss');
    expect(screen.getByRole('heading', { name: 'Dave (Team 2) to throw' })).toBeDefined();
    // The visit is the thrower's, by name.
    expect(within(screen.getByRole('region', { name: /visits/i })).getByText('Marco')).toBeDefined();
  });
});

