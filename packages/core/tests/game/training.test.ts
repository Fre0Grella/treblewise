import { describe, expect, it } from 'vitest';

import { parseHit } from '../../src/board/notation.js';
import {
  BOBS27_START,
  halveItTarget,
  reduceBobs27,
  reduceCountUp,
  reduceHalveIt,
  type Bobs27Config,
  type HalveItConfig,
} from '../../src/game/training.js';
import { ann, bob, darts, misses } from '../fixtures/modeDarts.js';

describe("Bob's 27", () => {
  const config = (overrides: Partial<Bobs27Config> = {}): Bobs27Config => ({
    mode: 'bobs27',
    bull: false,
    playOn: false,
    legsToWin: 1,
    players: [ann],
    ...overrides,
  });

  it('adds every double hit and aims at the next double', () => {
    const s = reduceBobs27(config(), darts('D1', 'D1', 'S1'));
    expect(s.legs[0]!.state.points.ann).toBe(BOBS27_START + 4);
    expect(s.current).toMatchObject({ round: 2, aim: parseHit('D2') });
  });

  it('takes the double away for a round without one', () => {
    const s = reduceBobs27(config(), darts(...misses()));
    expect(s.legs[0]!.state.points.ann).toBe(25);
    expect(s.legs[0]!.visits[0]!.busted).toBe(true);
  });

  it('ends at zero, unless it plays on', () => {
    // 27 − 2 − 4 − 6 − 8 − 10 = −3, after five rounds.
    const s = reduceBobs27(config(), darts(...misses(5)));
    expect(s.current).toBeNull();
    expect(s.winnerId).toBe('ann');
    const on = reduceBobs27(config({ playOn: true }), darts(...misses(5)));
    expect(on.current).not.toBeNull();
    expect(on.legs[0]!.state.points.ann).toBe(-3);
  });

  it('plays the bull last when asked', () => {
    const hits = Array.from({ length: 20 }, (_, i) => [`D${i + 1}`, 'MISS', 'MISS']).flat();
    const s = reduceBobs27(config({ bull: true }), darts(...hits));
    expect(s.current).toMatchObject({ round: 21, aim: parseHit('BULL') });
  });

  it('is won by the higher score, and drawn when level', () => {
    const two = config({ players: [ann, bob], playOn: true });
    const level = reduceBobs27(two, darts(...misses(40)));
    expect(level.current).toBeNull();
    expect(level.drawn).toBe(true);
    expect(level.winnerId).toBeNull();
  });
});

describe('Halve-it', () => {
  const config = (overrides: Partial<HalveItConfig> = {}): HalveItConfig => ({
    mode: 'halveIt',
    preset: 'classic',
    legsToWin: 1,
    players: [ann],
    ...overrides,
  });

  it('scores the target and halves a round without it', () => {
    const s = reduceHalveIt(config(), darts('T15', 'S15', 'S20', ...misses()));
    // 60, then halved on the 16.
    expect(s.legs[0]!.state.points.ann).toBe(30);
    expect(s.legs[0]!.visits[1]!.busted).toBe(true);
  });

  it('takes any double, any treble and either bull on those rounds', () => {
    expect(halveItTarget({ preset: 'classic' }, 3)).toBe('double');
    const s = reduceHalveIt(config(), darts(...misses(2), 'D7', 'BULL', 'S1'));
    expect(s.legs[0]!.state.points.ann).toBe(64);
  });

  it('ends after the last target', () => {
    const s = reduceHalveIt(config(), darts(...misses(9)));
    expect(s.current).toBeNull();
  });
});

describe('Count-up', () => {
  it('adds every dart and ends after the rounds, the higher score winning', () => {
    const s = reduceCountUp(
      { mode: 'countUp', rounds: 1, legsToWin: 1, players: [ann, bob] },
      darts('T20', 'T20', 'T20', 'S1', 'S1', 'S1'),
    );
    expect(s.legs[0]!.state.points).toEqual({ ann: 180, bob: 3 });
    expect(s.winnerId).toBe('ann');
    expect(s.current).toBeNull();
  });
});
