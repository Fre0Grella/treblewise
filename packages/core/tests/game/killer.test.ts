import { describe, expect, it } from 'vitest';

import { parseHit } from '../../src/board/notation.js';
import { drawKillerNumbers, isKiller, killerHits, reduceKiller, type KillerConfig } from '../../src/game/killer.js';
import { ann, bob, cat, darts } from '../fixtures/modeDarts.js';

function config(overrides: Partial<KillerConfig> = {}): KillerConfig {
  return {
    mode: 'killer',
    lives: 3,
    ring: 'double',
    hitsToKill: 1,
    selfHit: true,
    numbers: 'drawn',
    assigned: { ann: 1, bob: 2, cat: 3 },
    legsToWin: 1,
    players: [ann, bob],
    ...overrides,
  };
}

describe('killer hits', () => {
  it('counts doubles only, or every bed by its multiple', () => {
    expect(killerHits('double', parseHit('S5')!)).toBe(0);
    expect(killerHits('double', parseHit('D5')!)).toBe(1);
    expect(killerHits('any', parseHit('T5')!)).toBe(3);
    expect(killerHits('any', parseHit('BULL')!)).toBe(0);
  });
});

describe('drawn numbers', () => {
  it('are distinct', () => {
    const numbers = drawKillerNumbers(['a', 'b', 'c', 'd']);
    expect(new Set(Object.values(numbers)).size).toBe(4);
    for (const n of Object.values(numbers)) expect(n).toBeGreaterThanOrEqual(1);
  });
});

describe('a game of killer', () => {
  it('makes a killer of whoever hits their own number', () => {
    const s = reduceKiller(config(), darts('D1'));
    expect(isKiller(config(), s.legs[0]!.state, 'ann')).toBe(true);
  });

  it('only lets a killer take lives', () => {
    const s = reduceKiller(config(), darts('D2', 'D1', 'D2'));
    // The first D2 came before Ann was a killer.
    expect(s.legs[0]!.state.lives.bob).toBe(2);
  });

  it('is won by the last with a life, and skips whoever is out', () => {
    const three = config({ players: [ann, bob, cat], lives: 1 });
    const s = reduceKiller(three, darts('D1', 'D2', 'MISS'));
    expect(s.legs[0]!.state.lives.bob).toBe(0);
    expect(s.current).toMatchObject({ playerId: 'cat' });
    const more = reduceKiller(three, darts('D1', 'D2', 'MISS', 'MISS', 'MISS', 'MISS', 'D3'));
    expect(more.winnerId).toBe('ann');
  });

  it('costs a killer lives for hitting their own number', () => {
    const s = reduceKiller(config(), darts('D1', 'D1'));
    expect(s.legs[0]!.state.lives.ann).toBe(2);
    const spared = reduceKiller(config({ selfHit: false }), darts('D1', 'D1'));
    expect(spared.legs[0]!.state.lives.ann).toBe(3);
  });

  it('takes lives by the multiple when any bed counts', () => {
    const s = reduceKiller(config({ ring: 'any' }), darts('S1', 'T2'));
    expect(s.legs[0]!.state.lives.bob).toBe(0);
    expect(s.winnerId).toBe('ann');
  });

  it('needs several hits to become a killer when set so', () => {
    const s = reduceKiller(config({ hitsToKill: 3, ring: 'any' }), darts('D1', 'S2'));
    expect(s.legs[0]!.state.charge.ann).toBe(2);
    expect(s.legs[0]!.state.lives.bob).toBe(3);
  });
});

describe('numbers thrown for', () => {
  const thrown = config({ numbers: 'thrown', assigned: undefined });

  it('gives each player the number of one dart, and passes the throw', () => {
    const s = reduceKiller(thrown, darts('T7'));
    expect(s.legs[0]!.state.number.ann).toBe(7);
    expect(s.current).toMatchObject({ playerId: 'bob', dartInVisit: 0 });
  });

  it('throws again off the numbers or on a taken one', () => {
    const s = reduceKiller(thrown, darts('T7', 'MISS', 'S7'));
    expect(s.legs[0]!.state.number.bob).toBeNull();
    expect(s.current).toMatchObject({ playerId: 'bob' });
    const done = reduceKiller(thrown, darts('T7', 'MISS', 'S7', 'S9'));
    expect(done.legs[0]!.state.number.bob).toBe(9);
    expect(done.current).toMatchObject({ playerId: 'ann', dartInVisit: 0 });
  });
});
