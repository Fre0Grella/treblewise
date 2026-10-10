import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { allScoringHits, dartEvent, MISS, reduceMatch, type MatchEvent, type X01Config } from '@treblewise/core';
import { describe, expect, it } from 'vitest';

import { announce } from '@/caller/announce.js';
import { callWords, clipKey } from '@/caller/call.js';
import type { ClipIndex } from '@/caller/clips.js';
import { clipPhrases } from '@/caller/phrases.js';

// Vite rewrites `new URL(path, import.meta.url)` into a served address, so the path is built by hand.
const packDir = join(dirname(fileURLToPath(import.meta.url)), '../../public/caller/en');
const index = JSON.parse(readFileSync(join(packDir, 'index.json'), 'utf-8')) as ClipIndex;

describe('the English clip pack', () => {
  it('has a clip for every phrase the caller can say', () => {
    const missing = clipPhrases().filter(({ text }) => !(clipKey(text) in index.clips));
    expect(missing).toEqual([]);
  });

  it('ends where its last clip ends, and credits its voice', () => {
    const end = Math.max(...Object.values(index.clips).map(([offset, length]) => offset + length));
    expect(statSync(join(packDir, index.file)).size).toBe(end);
    expect(index.credit).toMatch(/Chatterbox/);
  });

  // The list the pack is built from has to cover what the match actually
  // says: play legs out at random and check every word that gets called.
  it('covers every call of real matches', () => {
    const config: X01Config = {
      startScore: 301,
      inRule: 'straight',
      outRule: 'double',
      legsPerSet: 2,
      setsToWin: 2,
      players: [
        { id: 'ann', name: 'Ann' },
        { id: 'bob', name: 'Bob' },
      ],
    };
    const hits = [MISS, ...allScoringHits()];
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

    const words = new Set<string>();
    for (let game = 0; game < 4; game += 1) {
      const events: MatchEvent[] = [];
      let before = reduceMatch(config, events);
      for (let throwNo = 0; throwNo < 1000 && before.winnerId === null; throwNo += 1) {
        // Aim at the doubles more often near the end, so legs get finished.
        const remaining = before.current ? before.legs.at(-1)!.remaining[before.current.playerId]! : 0;
        const pool = remaining <= 40 && random() < 0.6 ? hits.filter((h) => h.ring === 'double' || h.ring === 'bull') : hits;
        const hit = pool[Math.floor(random() * pool.length)]!;
        events.push(dartEvent(hit, { id: `d${game}-${throwNo}`, ts: throwNo }));
        const after = reduceMatch(config, events);
        for (const call of announce(before, after)) for (const word of callWords(call)) words.add(word);
        before = after;
      }
    }

    expect(words.size).toBeGreaterThan(50);
    expect([...words].filter((word) => !(clipKey(word) in index.clips))).toEqual([]);
  });
});
