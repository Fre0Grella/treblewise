import { parseHit, reduceMatch, dartEvent, type MatchEvent, type X01Config } from '@treblewise/core';
import { describe, expect, it } from 'vitest';

import { announce, bustedBy, type AnnounceOptions } from '@/caller/announce.js';
import type { Call } from '@/caller/call.js';

const config: X01Config = {
  startScore: 501,
  inRule: 'straight',
  outRule: 'double',
  legsPerSet: 1,
  setsToWin: 1,
  players: [
    { id: 'ann', name: 'Ann' },
    { id: 'bob', name: 'Bob' },
  ],
};

function darts(...notation: string[]): MatchEvent[] {
  return notation.map((text, index) =>
    dartEvent(parseHit(text)!, { id: `d${index}`, ts: 1_700_000_000_000 + index }),
  );
}

/** Announces the transition caused by the last dart of `notation`. */
function say(notation: string[], cfg: X01Config = config, options?: AnnounceOptions): Call[] {
  const { before, after } = move(notation, cfg);
  return announce(before, after, options);
}

/** The match before and after the last dart of `notation`. */
function move(notation: string[], cfg: X01Config = config) {
  const events = darts(...notation);
  return { before: reduceMatch(cfg, events.slice(0, -1)), after: reduceMatch(cfg, events) };
}

describe('announce', () => {
  it('says nothing in the middle of a visit', () => {
    expect(say(['T20'])).toEqual([]);
    expect(say(['T20', 'T20'])).toEqual([]);
  });

  // 501 − 180 = 321: too far out to be worth saying, so it hands over instead.
  it('calls the visit total in caller words, then the next player', () => {
    expect(say(['T20', 'T20', 'T20'])).toEqual([['one hundred and eighty'], [{ name: 'Bob' }, 'to throw']]);
    expect(say(['S5', 'S1', 'MISS'])).toEqual([['six'], [{ name: 'Bob' }, 'to throw']]);
    expect(say(['MISS', 'MISS', 'MISS'])).toEqual([['No score'], [{ name: 'Bob' }, 'to throw']]);
  });

  it('tells the player who threw what they are left on, not the opponent', () => {
    const cfg = { ...config, startScore: 170 };
    expect(say(['T20', 'T20', 'S10'], cfg)).toEqual([['one hundred and thirty'], [{ name: 'Ann' }, 'you require forty']]);
  });

  it('calls game shot with the leg, the set or the match, and who won it', () => {
    const cfg = { ...config, startScore: 40, legsPerSet: 2 };
    expect(say(['D20'], cfg)).toEqual([['Yes! Game shot, and the first leg', { name: 'Ann' }]]);

    // Ann wins the first leg; Bob, throwing first in the second, wins it too.
    expect(say(['D20', 'D20'], cfg)).toEqual([['Yes! Game shot, and the second leg', { name: 'Bob' }]]);

    const sets = { ...config, startScore: 40, setsToWin: 2 };
    expect(say(['D20'], sets)).toEqual([['Yes! Game shot, and the first set', { name: 'Ann' }]]);

    const matchCfg = { ...config, startScore: 40 };
    expect(say(['D20'], matchCfg)).toEqual([['Yes! Game shot, and the match', { name: 'Ann' }]]);
  });

  // The beat lets the glass of the bust land first (sounds.ts).
  it('calls no score a beat after a bust and repeats what the thrower still needs', () => {
    const cfg = { ...config, startScore: 20 };
    expect(say(['S19'], cfg)).toEqual([[{ pause: 250 }, 'No score'], [{ name: 'Ann' }, 'you require twenty']]);
  });

  it('knows a bust from the dart that made it, and only that dart', () => {
    const cfg = { ...config, startScore: 20 };
    const bust = move(['S19'], cfg);
    expect(bustedBy(bust.before, bust.after)).toBe(true);
    const visit = move(['T20', 'T20', 'T20']);
    expect(bustedBy(visit.before, visit.after)).toBe(false);
  });

  it('leaves the names out when asked, and does not say "to throw" to nobody', () => {
    const quiet = { names: false };
    expect(say(['T20', 'T20', 'T20'], config, quiet)).toEqual([['one hundred and eighty']]);
    expect(say(['T20', 'T20', 'S10'], { ...config, startScore: 170 }, quiet)).toEqual([
      ['one hundred and thirty'],
      ['you require forty'],
    ]);
    expect(say(['D20'], { ...config, startScore: 40 }, quiet)).toEqual([['Yes! Game shot, and the match']]);
  });
});
