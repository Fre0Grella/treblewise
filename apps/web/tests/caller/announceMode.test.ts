import { dartEvent, parseHit, reduceGame, type MatchEvent, type ModeConfig, type ModeSnapshot } from '@treblewise/core';
import { describe, expect, it } from 'vitest';

import { announceMode } from '@/caller/announce.js';

const ann = { id: 'ann', name: 'Ann' };
const bob = { id: 'bob', name: 'Bob' };

function darts(...notation: string[]): MatchEvent[] {
  return notation.map((text, index) => dartEvent(parseHit(text)!, { id: `d${index}`, ts: 1_700_000_000_000 + index }));
}

/** What is said for the last dart of `notation`. */
function say(config: ModeConfig, notation: string[], names = true) {
  const events = darts(...notation);
  const before = reduceGame(config, events.slice(0, -1)) as ModeSnapshot;
  const after = reduceGame(config, events) as ModeSnapshot;
  return announceMode(before, after, { names });
}

describe('the caller in the other games', () => {
  const countUp: ModeConfig = { mode: 'countUp', rounds: 2, legsToWin: 1, players: [ann, bob] };

  it('says nothing in the middle of a visit', () => {
    expect(say(countUp, ['T20'])).toEqual([]);
  });

  it('calls a visit worth points, then who is to throw', () => {
    expect(say(countUp, ['T20', 'T20', 'S20'])).toEqual([['one hundred and forty'], [{ name: 'Bob' }, 'to throw']]);
    expect(say(countUp, ['T20', 'T20', 'S20'], false)).toEqual([['one hundred and forty']]);
  });

  it('calls a halved round as no score', () => {
    const halve: ModeConfig = { mode: 'halveIt', preset: 'classic', legsToWin: 1, players: [ann] };
    expect(say(halve, ['MISS', 'MISS', 'MISS'])).toEqual([[{ pause: 250 }, 'No score']]);
  });

  it('calls no points in cricket, only the handover', () => {
    const cricket: ModeConfig = { mode: 'cricket', scoring: 'standard', legsToWin: 2, players: [ann, bob] };
    expect(say(cricket, ['T20', 'T19', 'T18'])).toEqual([[{ name: 'Bob' }, 'to throw']]);
  });

  it('calls the match, and nothing at the end of a drill played alone', () => {
    const clock: ModeConfig = {
      mode: 'aroundTheClock',
      ring: 'any',
      order: 'up',
      bull: false,
      hitsPerTarget: 1,
      multiples: true,
      legsToWin: 1,
      players: [ann, bob],
    };
    // Multiples skip ahead: T1 covers 1–3, D4 4–5, T6 6–8, and so on to the 20.
    const calls = say(clock, ['T1', 'D4', 'T6', 'MISS', 'MISS', 'MISS', 'T9', 'T12', 'T15', 'MISS', 'MISS', 'MISS', 'D18', 'S20']);
    expect(calls).toEqual([['Yes! Game shot, and the match', { name: 'Ann' }]]);
    expect(say({ ...countUp, rounds: 1, players: [ann] }, ['S1', 'S1', 'S1'])).toEqual([]);
  });

  it('calls the teammate whose turn it is', () => {
    const team: ModeConfig = {
      mode: 'countUp',
      rounds: 3,
      legsToWin: 1,
      players: [ann, bob, { id: 'cat', name: 'Cat' }, { id: 'dan', name: 'Dan' }],
      teams: [
        { id: 't1', name: 'Team 1', members: ['ann', 'cat'] },
        { id: 't2', name: 'Team 2', members: ['bob', 'dan'] },
      ],
    };
    // Ann throws for Team 1, Bob for Team 2: then Cat is called up.
    expect(say(team, ['S1', 'S1', 'S1', 'S2', 'S2', 'S2']).at(-1)).toEqual([{ name: 'Cat' }, 'to throw']);
  });
});

