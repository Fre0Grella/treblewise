import { dartEvent, parseHit, reduceGame, type MatchEvent, type ModeConfig, type ModeSnapshot } from '@treblewise/core';
import { describe, expect, it } from 'vitest';

import { gameSummary, modeCards, modeHeading, modeRows, modeTitle, visitLine } from '@/game/modeView.js';

const ann = { id: 'ann', name: 'Ann' };
const bob = { id: 'bob', name: 'Bob' };

function darts(...notation: string[]): MatchEvent[] {
  return notation.map((text, index) => dartEvent(parseHit(text)!, { id: `d${index}`, ts: index }));
}

const fold = (config: ModeConfig, ...notation: string[]) => reduceGame(config, darts(...notation)) as ModeSnapshot;

describe('the other games on screen', () => {
  it('sums a game and its settings up in a line', () => {
    expect(gameSummary({ mode: 'cricket', scoring: 'cutThroat', legsToWin: 3, players: [] })).toBe('Cricket · cut-throat · first to 3 legs');
    expect(
      gameSummary({ mode: 'aroundTheClock', ring: 'double', order: 'down', bull: true, hitsPerTarget: 1, multiples: false, legsToWin: 1, players: [] }),
    ).toBe('Around the clock · 20 → 1 · doubles · bull to finish · first to 1 leg');
    expect(gameSummary({ mode: 'bobs27', bull: false, playOn: false, legsToWin: 1, players: [] })).toBe('Bob’s 27');
    expect(gameSummary({ startScore: 501, inRule: 'straight', outRule: 'double', legsPerSet: 3, setsToWin: 1, players: [] })).toContain('501');
  });

  it('puts the target on the card and in the heading around the clock', () => {
    const clock: ModeConfig = { mode: 'aroundTheClock', ring: 'double', order: 'up', bull: false, hitsPerTarget: 1, multiples: false, legsToWin: 1, players: [ann, bob] };
    const s = fold(clock, 'D1', 'D2', 'S3');
    const [a, b] = modeCards(s);
    expect(a).toMatchObject({ value: 'D3', caption: '2 of 20 numbers', current: false });
    expect(b).toMatchObject({ value: 'D1', current: true });
    expect(modeHeading(s)).toBe('Bob, aim at D1');
    expect(visitLine(s, s.legs[0]!.visits[0]!).total).toBe('2 hits');
  });

  it('shows the killer numbers, the lives and who is a killer', () => {
    const killer: ModeConfig = {
      mode: 'killer',
      lives: 3,
      ring: 'double',
      hitsToKill: 1,
      selfHit: true,
      numbers: 'drawn',
      assigned: { ann: 7, bob: 12 },
      legsToWin: 1,
      players: [ann, bob],
    };
    const s = fold(killer, 'D7', 'D12');
    const [a, b] = modeCards(s);
    expect(a).toMatchObject({ value: '7', badge: 'Killer', pips: { on: 3, of: 3 } });
    expect(b).toMatchObject({ value: '12', badge: null, pips: { on: 2, of: 3 } });
  });

  it('asks for a number to be thrown for', () => {
    const killer: ModeConfig = { mode: 'killer', lives: 3, ring: 'double', hitsToKill: 1, selfHit: true, numbers: 'thrown', legsToWin: 1, players: [ann, bob] };
    expect(modeHeading(fold(killer))).toBe('Ann, throw for your number');
  });

  it('writes a Halve-it round that missed as halved', () => {
    const s = fold({ mode: 'halveIt', preset: 'classic', legsToWin: 1, players: [ann] }, 'S15', 'MISS', 'MISS', 'MISS', 'MISS', 'MISS');
    expect(visitLine(s, s.legs[0]!.visits[1]!)).toEqual({ total: 'halved', left: 'total 7' });
    expect(modeCards(s)[0]).toMatchObject({ value: '7', caption: 'Round 3 of 9 · any double' });
    expect(modeHeading(s)).toBe('Ann, aim at any double');
  });

  it('titles a match of legs with the score', () => {
    const s = fold({ mode: 'cricket', scoring: 'standard', legsToWin: 3, players: [ann, bob] });
    expect(modeTitle(s)).toBe('Cricket · First to 3 legs · 0–0');
  });

  it('puts the numbers side by side at the end', () => {
    const s = fold({ mode: 'cricket', scoring: 'standard', legsToWin: 1, players: [ann, bob] }, 'T20', 'T20', 'MISS');
    const rows = modeRows(s, s.legs);
    expect(rows.map((row) => row.label)).toEqual(['Points', 'Marks', 'Marks per round', 'Darts']);
    expect(rows[0]!.values).toEqual([60, 0]);
    expect(rows[1]!.values).toEqual([6, 0]);
    expect(rows[2]!.texts).toEqual(['6.0', '–']);
  });
});
