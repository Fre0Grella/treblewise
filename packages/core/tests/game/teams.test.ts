import { describe, expect, it } from 'vitest';

import { reduceCricket } from '../../src/game/cricket.js';
import { membersOf, sideOf, sides, type Lineup } from '../../src/game/teams.js';
import { reduceMatch, type X01Config } from '../../src/game/x01.js';
import { careerStats } from '../../src/stats/career.js';
import { legStats, matchStats } from '../../src/stats/match.js';
import { positionedDarts } from '../../src/stats/positional.js';
import { darts, misses } from '../fixtures/modeDarts.js';

const marco = { id: 'marco', name: 'Marco' };
const giulia = { id: 'giulia', name: 'Giulia' };
const dave = { id: 'dave', name: 'Dave' };
const anna = { id: 'anna', name: 'Anna' };

const pairs: Lineup = {
  players: [marco, giulia, dave, anna],
  teams: [
    { id: 't1', name: 'Team 1', members: ['marco', 'giulia'] },
    { id: 't2', name: 'Team 2', members: ['dave', 'anna'] },
  ],
};

const x01 = (overrides: Partial<X01Config> = {}): X01Config => ({
  ...pairs,
  startScore: 501,
  inRule: 'straight',
  outRule: 'double',
  legsPerSet: 1,
  setsToWin: 1,
  ...overrides,
});

describe('sides', () => {
  it('are the teams when there are teams, and the players when not', () => {
    expect(sides(pairs).map((side) => side.name)).toEqual(['Team 1', 'Team 2']);
    expect(sides({ players: [marco, dave] }).map((side) => side.id)).toEqual(['marco', 'dave']);
    expect(sideOf(pairs, 'anna')).toBe('t2');
    expect(sideOf({ players: [marco] }, 'marco')).toBe('marco');
    expect(membersOf(pairs, 't1').map((p) => p.name)).toEqual(['Marco', 'Giulia']);
  });
});

describe('a pairs match of X01', () => {
  it('takes turns team by team, the members of each in turn', () => {
    const s = reduceMatch(x01(), darts(...misses(5)));
    expect(s.legs[0]!.visits.map((v) => `${v.playerId}:${v.throwerId}`)).toEqual([
      't1:marco',
      't2:dave',
      't1:giulia',
      't2:anna',
      't1:marco',
    ]);
    expect(s.current).toMatchObject({ playerId: 't2', throwerId: 'dave' });
  });

  it('shares the score across the team', () => {
    const s = reduceMatch(x01(), darts('T20', 'T20', 'T20', ...misses(), 'T20', 'T20', 'T20'));
    expect(s.legs[0]!.remaining).toEqual({ t1: 141, t2: 501 });
  });

  it('names the one at the oche before the first dart, and mid-visit', () => {
    expect(reduceMatch(x01(), []).current).toMatchObject({ playerId: 't1', throwerId: 'marco' });
    const mid = reduceMatch(x01(), darts(...misses(), 'S1'));
    expect(mid.current).toMatchObject({ playerId: 't2', throwerId: 'dave', dartInVisit: 1 });
  });

  it('keeps the members turning across legs', () => {
    // Team 1 checks out in its first visit (Marco); the next leg Team 2 starts, then Giulia.
    const s = reduceMatch(x01({ startScore: 40, legsPerSet: 2 }), darts('D20', ...misses(2)));
    expect(s.legs[1]!.visits.map((v) => v.throwerId)).toEqual(['dave', 'giulia']);
  });
});

describe('statistics in a pairs match', () => {
  // Marco 121, Dave nothing, Giulia 40 with two darts so far.
  const s = reduceMatch(x01(), darts('T20', 'T20', 'S1', ...misses(), 'S20', 'D10'));

  it('counts each person their own darts', () => {
    const byPerson = matchStats(s);
    expect(byPerson.marco!.points).toBe(121);
    expect(byPerson.giulia!.points).toBe(40);
    expect(byPerson.giulia!.dartsThrown).toBe(2);
    expect(byPerson.dave!.dartsThrown).toBe(3);
    expect(byPerson.anna!.dartsThrown).toBe(0);
  });

  it('counts the side as one when asked', () => {
    const bySide = matchStats(s, 'side');
    expect(Object.keys(bySide)).toEqual(['t1', 't2']);
    expect(bySide.t1!.points).toBe(161);
    expect(bySide.t1!.legsWon).toBe(0);
  });

  it('gives a won leg to whoever checked out, and the team result to its members', () => {
    const won = reduceMatch(x01({ startScore: 40 }), darts('D20'));
    expect(matchStats(won).marco!.legsWon).toBe(1);
    expect(matchStats(won).giulia!.legsWon).toBe(0);
    expect(legStats(won, 'marco')[0]!.won).toBe(true);
    expect(careerStats([won], 'marco').firstThrowLegsWon).toBe(1);
  });

  it('puts a dart on the board map of the person who threw it', () => {
    const placed = reduceMatch(x01(), [
      { type: 'dart.thrown', id: 'a', ts: 1, hit: { sector: 20, ring: 'single', value: 20 }, pos: { x: 0, y: 140 }, source: 'manual' },
    ]);
    expect(positionedDarts([placed], { playerId: 'marco' })).toHaveLength(1);
    expect(positionedDarts([placed], { playerId: 'giulia' })).toHaveLength(0);
  });
});

describe('teams in the other games', () => {
  it('play cricket as sides: one board per team, its marks shared', () => {
    // Marco closes the 20; Dave misses; Giulia's single 20 then scores for the team.
    const s = reduceCricket({ mode: 'cricket', scoring: 'standard', legsToWin: 1, ...pairs }, darts('T20', 'MISS', 'MISS', ...misses(), 'S20'));
    expect(Object.keys(s.legs[0]!.state.marks)).toEqual(['t1', 't2']);
    expect(s.legs[0]!.state.points.t1).toBe(20);
    expect(s.legs[0]!.visits.map((v) => v.throwerId)).toEqual(['marco', 'dave', 'giulia']);
    expect(s.current).toMatchObject({ playerId: 't1', throwerId: 'giulia', dartInVisit: 1 });
  });
});
