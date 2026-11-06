import { describe, expect, it } from 'vitest';

import { parseHit } from '../../src/board/notation.js';
import { cricketMarks, reduceCricket, type CricketConfig } from '../../src/game/cricket.js';
import { ann, bob, cat, darts, misses } from '../fixtures/modeDarts.js';

function config(overrides: Partial<CricketConfig> = {}): CricketConfig {
  return { mode: 'cricket', scoring: 'standard', legsToWin: 1, players: [ann, bob], ...overrides };
}

/** Ann closes everything in 7 visits while Bob misses: T20 T19 T18 / T17 T16 T15 / BULL 25. */
const annClosesAll = [
  'T20', 'T19', 'T18', ...misses(),
  'T17', 'T16', 'T15', ...misses(),
  'BULL', '25', 'MISS',
];

describe('cricket marks', () => {
  it('counts singles, doubles, trebles and the two bulls', () => {
    expect(cricketMarks(parseHit('T20')!)).toEqual({ number: 20, marks: 3 });
    expect(cricketMarks(parseHit('D15')!)).toEqual({ number: 15, marks: 2 });
    expect(cricketMarks(parseHit('25')!)).toEqual({ number: 25, marks: 1 });
    expect(cricketMarks(parseHit('BULL')!)).toEqual({ number: 25, marks: 2 });
    expect(cricketMarks(parseHit('S14')!)).toBeNull();
    expect(cricketMarks(parseHit('MISS')!)).toBeNull();
  });
});

describe('standard cricket', () => {
  it('marks, then scores past the third mark while the number is open elsewhere', () => {
    const s = reduceCricket(config(), darts('S20', 'T20', 'D20'));
    const state = s.legs[0]!.state;
    expect(state.marks.ann![20]).toBe(6);
    // S20 + T20 = 4 marks: one past the third (20); D20 two more (40).
    expect(state.points.ann).toBe(60);
    expect(s.legs[0]!.remaining.ann).toBe(60);
    expect(s.legs[0]!.visits[0]!.darts.map((d) => d.hits)).toEqual([1, 3, 2]);
    expect(s.current).toMatchObject({ playerId: 'bob', dartInVisit: 0 });
  });

  it('scores nothing on a number everyone has closed', () => {
    const s = reduceCricket(config(), darts('T20', 'MISS', 'MISS', 'T20', 'MISS', 'MISS', 'T20'));
    expect(s.legs[0]!.state.points).toEqual({ ann: 0, bob: 0 });
  });

  it('wins the leg the moment everything is closed and the score allows it', () => {
    const s = reduceCricket(config(), darts(...annClosesAll));
    expect(s.winnerId).toBe('ann');
    expect(s.current).toBeNull();
    const last = s.legs[0]!.visits.at(-1)!;
    expect(last.won).toBe(true);
    // The leg ended on the 25: the third dart was never thrown.
    expect(last.darts).toHaveLength(2);
  });

  it('keeps a player who has closed everything but trails on points scoring', () => {
    // Bob scores 60 on the 20 before Ann closes it, then misses.
    const s = reduceCricket(
      config(),
      darts('MISS', 'MISS', 'MISS', 'T20', 'T20', 'MISS', ...annClosesAll),
    );
    expect(s.winnerId).toBeNull();
    expect(s.legs[0]!.state.points.bob).toBe(60);
  });

  it('plays legs to the number set, the throw passing each leg', () => {
    const one = darts(...annClosesAll);
    const s = reduceCricket(config({ legsToWin: 2 }), [...one, ...darts(...misses(), ...annClosesAll).map((e, i) => ({ ...e, id: `x${i}` }))]);
    expect(s.legsWon).toEqual({ ann: 1, bob: 0 });
    expect(s.legs).toHaveLength(2);
    expect(s.legs[1]!.startingPlayerId).toBe('bob');
    expect(s.winnerId).toBeNull();
  });
});

describe('cut-throat cricket', () => {
  it('gives the points to everyone with the number open', () => {
    const s = reduceCricket(config({ scoring: 'cutThroat', players: [ann, bob, cat] }), darts('T20', 'D20'));
    expect(s.legs[0]!.state.points).toEqual({ ann: 0, bob: 40, cat: 40 });
  });

  it('is won by closing everything with the fewest points', () => {
    const s = reduceCricket(config({ scoring: 'cutThroat' }), darts(...annClosesAll));
    expect(s.winnerId).toBe('ann');
  });
});

describe('no-score cricket', () => {
  it('scores nothing and is won by closing first', () => {
    const s = reduceCricket(config({ scoring: 'noScore' }), darts('T20', 'T20', ...annClosesAll.slice(2)));
    expect(s.legs[0]!.state.points.ann).toBe(0);
  });
});

describe('a correction in cricket', () => {
  it('replaces the dart when the log is folded', () => {
    const events = darts('S20');
    const s = reduceCricket(config(), [
      ...events,
      { type: 'dart.corrected', id: 'c', ts: 2, target: 'd0', hit: parseHit('T20')!, source: 'manual' },
    ]);
    expect(s.legs[0]!.state.marks.ann![20]).toBe(3);
    expect(s.legs[0]!.visits[0]!.darts[0]!.original?.hit).toEqual(parseHit('S20'));
  });
});
