import { describe, expect, it } from 'vitest';

import { reduceAroundTheClock } from '../../src/game/aroundTheClock.js';
import { reduceCricket } from '../../src/game/cricket.js';
import { reduceGame } from '../../src/game/modes.js';
import { reduceBobs27, reduceCountUp } from '../../src/game/training.js';
import { modeStats, resultSummary } from '../../src/stats/modes.js';
import { ann, bob, darts, misses } from '../fixtures/modeDarts.js';

const clock = (players = [ann]) =>
  ({ mode: 'aroundTheClock', ring: 'any', order: 'up', bull: false, hitsPerTarget: 1, multiples: false, legsToWin: 1, players }) as const;

describe('statistics of the other games', () => {
  it('records what every dart was thrown at, and the hit rate number by number', () => {
    const s = reduceAroundTheClock({ ...clock() }, darts('S1', 'MISS', 'S2', 'S5'));
    expect(s.legs[0]!.visits.flatMap((v) => v.darts.map((d) => d.target))).toEqual([1, 2, 2, 3]);
    const stats = modeStats([s], 'aroundTheClock', 'ann');
    expect(stats.targets.map((t) => [t.target, t.darts, t.hits])).toEqual([
      [1, 1, 1],
      [2, 2, 1],
      [3, 1, 0],
    ]);
    expect(stats.hitRate).toBe(50);
    // The leg is not over: no result yet.
    expect(stats.legs).toBe(0);
  });

  it('gives round the clock the darts it took to get round, the fewest being best', () => {
    const round = Array.from({ length: 20 }, (_, i) => `S${i + 1}`);
    const fast = reduceAroundTheClock(clock(), darts(...round));
    const slow = reduceAroundTheClock(clock(), darts(...round.slice(0, 10), 'MISS', 'MISS', ...round.slice(10)));
    const stats = modeStats([fast, slow], 'aroundTheClock', 'ann');
    expect(stats.legs).toBe(2);
    expect(stats.won).toBe(2);
    expect(stats.results.map((r) => r.value)).toEqual([20, 22]);
    expect(resultSummary(stats)).toEqual({ best: 20, average: 21 });
  });

  it('measures cricket in marks: per number, per round, and the trebles', () => {
    const s = reduceCricket({ mode: 'cricket', scoring: 'standard', legsToWin: 1, players: [ann, bob] }, darts('T20', 'S19', 'MISS', ...misses()));
    const stats = modeStats([s], 'cricket', 'ann');
    expect(stats.marks[20]).toBe(3);
    expect(stats.marks[19]).toBe(1);
    expect(stats.trebles).toBe(1);
    expect(stats.counted).toBe(2);
  });

  it('gives the drills their final points, and leaves the other player out', () => {
    const bobs = reduceBobs27({ mode: 'bobs27', bull: false, playOn: false, legsToWin: 1, players: [ann] }, darts(...misses(5)));
    const stats = modeStats([bobs], 'bobs27', 'ann');
    expect(stats.results.map((r) => r.value)).toEqual([-3]);
    expect(stats.targets.map((t) => t.target)).toEqual([1, 2, 3, 4, 5]);
    expect(modeStats([bobs], 'bobs27', 'bob').legs).toBe(0);
  });

  it('keeps every game to its own numbers', () => {
    const countUp = reduceCountUp({ mode: 'countUp', rounds: 1, legsToWin: 1, players: [ann] }, darts('T20', 'T20', 'T20'));
    const s = reduceGame({ ...clock() }, darts('S1'));
    const stats = modeStats([countUp, s as never], 'countUp', 'ann');
    expect(stats.points).toBe(180);
    expect(stats.bestVisit).toBe(180);
    expect(stats.darts).toBe(3);
  });
});
