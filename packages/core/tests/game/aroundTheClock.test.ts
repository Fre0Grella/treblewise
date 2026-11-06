import { describe, expect, it } from 'vitest';

import { parseHit } from '../../src/board/notation.js';
import {
  clockAim,
  clockHits,
  clockSequence,
  reduceAroundTheClock,
  type AroundTheClockConfig,
} from '../../src/game/aroundTheClock.js';
import { ann, bob, darts, misses } from '../fixtures/modeDarts.js';

function config(overrides: Partial<AroundTheClockConfig> = {}): AroundTheClockConfig {
  return {
    mode: 'aroundTheClock',
    ring: 'any',
    order: 'up',
    bull: false,
    hitsPerTarget: 1,
    multiples: false,
    legsToWin: 1,
    players: [ann],
    ...overrides,
  };
}

const h = (text: string) => parseHit(text)!;

describe('the sequence', () => {
  it('goes up, down or round the board, with the bull last when asked', () => {
    expect(clockSequence({ order: 'up', bull: false }).slice(0, 3)).toEqual([1, 2, 3]);
    expect(clockSequence({ order: 'down', bull: false }).slice(0, 3)).toEqual([20, 19, 18]);
    expect(clockSequence({ order: 'board', bull: true }).slice(0, 3)).toEqual([20, 1, 18]);
    expect(clockSequence({ order: 'board', bull: true }).at(-1)).toBe(25);
  });
});

describe('what counts', () => {
  it('takes any bed, or only the one set', () => {
    expect(clockHits({ ring: 'any', multiples: false }, 5, h('T5'))).toBe(1);
    expect(clockHits({ ring: 'double', multiples: false }, 5, h('S5'))).toBe(0);
    expect(clockHits({ ring: 'double', multiples: false }, 5, h('D5'))).toBe(1);
    expect(clockHits({ ring: 'any', multiples: false }, 5, h('S6'))).toBe(0);
  });

  it('counts a double two and a treble three when multiples count', () => {
    expect(clockHits({ ring: 'any', multiples: true }, 5, h('T5'))).toBe(3);
    expect(clockHits({ ring: 'any', multiples: true }, 25, h('BULL'))).toBe(2);
  });

  it('takes the bull by bed: the 25 for singles, the bullseye for doubles', () => {
    expect(clockHits({ ring: 'single', multiples: false }, 25, h('25'))).toBe(1);
    expect(clockHits({ ring: 'single', multiples: false }, 25, h('BULL'))).toBe(0);
    expect(clockHits({ ring: 'double', multiples: false }, 25, h('BULL'))).toBe(1);
    expect(clockAim({ ring: 'double' }, 25)).toEqual(h('BULL'));
    expect(clockAim({ ring: 'treble' }, 7)).toEqual(h('T7'));
  });
});

describe('a game around the clock', () => {
  it('moves on a target per hit and aims at the next one', () => {
    const s = reduceAroundTheClock(config(), darts('S1', 'S2', 'S7'));
    expect(s.legs[0]!.state.hits.ann).toBe(2);
    expect(s.current).toMatchObject({ playerId: 'ann', round: 2, aim: h('S3'), remaining: 18 });
  });

  it('needs the hits per target before moving on', () => {
    const s = reduceAroundTheClock(config({ hitsPerTarget: 2 }), darts('S1', 'S1', 'S2'));
    expect(s.current!.aim).toEqual(h('S2'));
    expect(s.legs[0]!.state.hits.ann).toBe(3);
  });

  it('skips ahead with multiples', () => {
    const s = reduceAroundTheClock(config({ multiples: true }), darts('T1', 'D4'));
    expect(s.current!.aim).toEqual(h('S6'));
  });

  it('is won by the first to finish, mid-visit', () => {
    const throws = Array.from({ length: 20 }, (_, i) => `S${i + 1}`);
    const s = reduceAroundTheClock(config({ players: [ann, bob] }), darts(...interleave(throws)));
    expect(s.winnerId).toBe('ann');
    expect(s.current).toBeNull();
  });

  it('closes on the bull when it is played', () => {
    const throws = [...Array.from({ length: 20 }, (_, i) => `S${i + 1}`), 'MISS', '25'];
    const s = reduceAroundTheClock(config({ bull: true }), darts(...throws));
    expect(s.winnerId).toBe('ann');
  });
});

/** Ann's darts three at a time, with a visit of misses for Bob after each. */
function interleave(throws: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < throws.length; i += 3) out.push(...throws.slice(i, i + 3), ...misses());
  return out;
}
