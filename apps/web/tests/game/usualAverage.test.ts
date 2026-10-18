import { dartEvent, hit, type X01Config } from '@treblewise/core';
import { describe, expect, it } from 'vitest';

import { SPAN, averageColour, difference, usualAverages } from '@/game/usualAverage.js';
import type { StoredMatch } from '@/storage/types.js';

const config: X01Config = {
  startScore: 501,
  inRule: 'straight',
  outRule: 'double',
  legsPerSet: 1,
  setsToWin: 1,
  players: [
    { id: 'ann', name: 'Ann' },
    { id: 'guest', name: 'Guest', temporary: true },
  ],
};

/** A match where Ann throws three darts of the given value each visit and the guest misses. */
function match(id: string, value: 20 | 5, finished: boolean): StoredMatch {
  const events = Array.from({ length: 6 }, (_, i) => dartEvent(i < 3 ? hit(value, 'single') : hit(1, 'single'), { id: `${id}-${i}`, ts: i }));
  return { id, createdAt: 0, updatedAt: 0, config, events, finished };
}

describe('the usual average', () => {
  it('comes from finished matches only, never the one being played', () => {
    const history = [match('old', 20, true), match('open', 5, false), match('now', 5, true)];
    const usual = usualAverages(config.players, history, 'now');
    expect(usual.ann).toBeCloseTo(60);
  });

  it('is nothing for a guest, or a profile with no finished match', () => {
    const usual = usualAverages(config.players, [match('open', 20, false)], null);
    expect(usual).toEqual({ ann: null, guest: null });
  });
});

describe('the colour against it', () => {
  it('is the yellow around the usual, red below and green above, full at SPAN points', () => {
    expect(averageColour(60, 60)).toBe('#eacf75');
    expect(averageColour(60 - SPAN, 60)).toBe('#e0425a');
    expect(averageColour(60 + SPAN * 2, 60)).toBe('#4fbf7f');
    // Half way down: half way from yellow to red.
    expect(averageColour(60 - SPAN / 2, 60)).toBe('#e58968');
  });

  it('writes no difference within a point of the usual', () => {
    expect(difference(60.5, 60)).toBeNull();
    expect(difference(63.2, 60)).toBeCloseTo(3.2);
    expect(difference(56, 60)).toBeCloseTo(-4);
  });
});
