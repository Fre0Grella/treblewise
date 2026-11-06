import { describe, expect, it } from 'vitest';

import { parseHit } from '../../src/board/notation.js';
import { reduceShanghai, shanghaiTarget, type ShanghaiConfig } from '../../src/game/shanghai.js';
import { ann, bob, darts, misses } from '../fixtures/modeDarts.js';

function config(overrides: Partial<ShanghaiConfig> = {}): ShanghaiConfig {
  return { mode: 'shanghai', rounds: 3, shanghaiWins: true, legsToWin: 1, players: [ann, bob], ...overrides };
}

describe('shanghai', () => {
  it('scores only the round number', () => {
    const s = reduceShanghai(config(), darts('S1', 'T1', 'S20'));
    expect(s.legs[0]!.state.points.ann).toBe(4);
    expect(s.legs[0]!.visits[0]!.darts.map((d) => d.scored)).toEqual([1, 3, 0]);
  });

  it('aims each round at its number', () => {
    const s = reduceShanghai(config(), darts(...misses(), ...misses()));
    expect(s.current).toMatchObject({ playerId: 'ann', round: 2, aim: parseHit('S2') });
    expect(shanghaiTarget({ rounds: 7 }, 8)).toBe(25);
  });

  it('is won on points after the last round', () => {
    const s = reduceShanghai(config({ rounds: 2 }), darts('S1', 'MISS', 'MISS', ...misses(), ...misses(), 'S2', 'MISS', 'MISS'));
    expect(s.winnerId).toBe('bob');
  });

  it('wins on the spot with a Shanghai', () => {
    const s = reduceShanghai(config(), darts('S1', 'D1', 'T1'));
    expect(s.winnerId).toBe('ann');
    expect(s.legs[0]!.state.shanghai).toBe('ann');
  });

  it('plays a Shanghai as points when it does not win', () => {
    const s = reduceShanghai(config({ shanghaiWins: false }), darts('S1', 'D1', 'T1'));
    expect(s.winnerId).toBeNull();
    expect(s.legs[0]!.state.points.ann).toBe(6);
  });

  it('goes to the bull when level after the last round', () => {
    const level = reduceShanghai(config({ rounds: 1 }), darts(...misses(), ...misses()));
    expect(level.winnerId).toBeNull();
    expect(level.current).toMatchObject({ playerId: 'ann', round: 2 });
    expect(level.current!.aim).toEqual(parseHit('25'));
    const decided = reduceShanghai(config({ rounds: 1 }), darts(...misses(), ...misses(), ...misses(), 'BULL'));
    // Bob's bull is his round's first dart: the round is not over until his visit is.
    expect(decided.winnerId).toBeNull();
    const done = reduceShanghai(config({ rounds: 1 }), darts(...misses(), ...misses(), ...misses(), 'BULL', 'MISS', 'MISS'));
    expect(done.winnerId).toBe('bob');
  });
});
