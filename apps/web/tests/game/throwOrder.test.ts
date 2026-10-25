import { BULL, OUTER_BULL, hit, type PlayerConfig } from '@treblewise/core';
import { describe, expect, it } from 'vitest';

import { bullOff, moveTo, pickOne, startingWith, wheelTurn, type BullThrow } from '@/game/throwOrder.js';

const players: PlayerConfig[] = [
  { id: 'ann', name: 'Ann' },
  { id: 'bob', name: 'Bob' },
  { id: 'cat', name: 'Cat' },
];

const at = (id: string, x: number, y: number, thrown = hit(20, 'single')): BullThrow => ({ id, hit: thrown, pos: { x, y } });

describe('moveTo', () => {
  it('moves one player, the others closing up around them', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveTo(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveTo(['a', 'b'], 1, 9)).toEqual(['a', 'b']);
  });
});

describe('startingWith', () => {
  it('starts with the chosen player, the turn going round as before', () => {
    expect(startingWith(players, 'cat').map((p) => p.id)).toEqual(['cat', 'ann', 'bob']);
    expect(startingWith(players, 'ann').map((p) => p.id)).toEqual(['ann', 'bob', 'cat']);
  });
});

describe('bullOff', () => {
  it('puts the closest dart first, and the rest in order of how close', () => {
    expect(bullOff([[at('ann', 0, 40), at('bob', 10, 0), at('cat', 0, -25)]])).toEqual({
      kind: 'decided',
      order: ['bob', 'cat', 'ann'],
    });
  });

  it('calls two darts in the same bull a tie, however close each is to the middle', () => {
    const round = [at('ann', 1, 0, BULL), at('bob', 5, 0, BULL), at('cat', 0, 60)];
    expect(bullOff([round])).toEqual({ kind: 'tie', tied: ['ann', 'bob'] });

    const outer = [at('ann', 8, 0, OUTER_BULL), at('bob', 14, 0, OUTER_BULL)];
    expect(bullOff([outer])).toEqual({ kind: 'tie', tied: ['ann', 'bob'] });
  });

  it('but the 50 beats the 25', () => {
    expect(bullOff([[at('ann', 0, 9, OUTER_BULL), at('bob', 5, 0, BULL)]])).toEqual({ kind: 'decided', order: ['bob', 'ann'] });
  });

  it('settles a tie with the tied players throwing again, the others after them', () => {
    const first = [at('ann', 1, 0, BULL), at('bob', 5, 0, BULL), at('cat', 0, 60)];
    const again = [at('ann', 0, 30), at('bob', 0, 20)];
    expect(bullOff([first, again])).toEqual({ kind: 'decided', order: ['bob', 'ann', 'cat'] });
  });

  it('keeps going while they keep tying', () => {
    const first = [at('ann', 1, 0, BULL), at('bob', 5, 0, BULL)];
    expect(bullOff([first, first])).toEqual({ kind: 'tie', tied: ['ann', 'bob'] });
  });
});

describe('the wheel', () => {
  it('picks every player, evenly', () => {
    expect(pickOne(3, () => 0)).toBe(0);
    expect(pickOne(3, () => 0.5)).toBe(1);
    expect(pickOne(3, () => 0.9999)).toBe(2);
  });

  it('turns to stop the chosen segment under the pointer', () => {
    for (const [index, n] of [
      [0, 2],
      [1, 2],
      [2, 3],
      [5, 8],
    ] as const) {
      const turned = wheelTurn(index, n);
      // The segment's middle, turned with the wheel, ends at the top.
      expect((((index + 0.5) * (360 / n) + turned) % 360 + 360) % 360).toBeCloseTo(0, 6);
      expect(turned).toBeGreaterThan(360 * 4);
    }
  });
});
