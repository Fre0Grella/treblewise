/**
 * Every phrase the caller can say, names apart: what a clip pack has to hold.
 *
 * The pack is generated from this list (scripts/build-caller-pack.py), and a
 * test checks the shipped pack against it, so a phrase changed in a locale
 * file cannot quietly go unrecorded.
 */

import { MISS, allScoringHits, type Hit } from '@treblewise/core';

import { strings } from '../i18n/index.js';
import type { Strings } from '../i18n/en.js';

import { callWords, clipKey } from './call.js';

/**
 * How excited the caller sounds, 0 to 5, as a stage caller rises with the
 * score: flat for a poor visit, calm for an ordinary one, then excited,
 * enthusiastic, wild, and 180 as its own moment.
 */
export type Mood = 0 | 1 | 2 | 3 | 4 | 5;

export interface ClipPhrase {
  text: string;
  mood: Mood;
}

export function visitMood(total: number): Mood {
  if (total >= 180) return 5;
  if (total >= 140) return 4;
  if (total >= 100) return 3;
  if (total >= 60) return 2;
  if (total >= 20) return 1;
  return 0;
}

// A single is said as plainly as a poor visit: "twelve" is the same clip for both.
function hitMood(hit: Hit): Mood {
  if (hit.ring === 'miss' || hit.ring === 'single') return 0;
  if (hit.ring === 'bull') return 3;
  return 2;
}

export function clipPhrases(t: Strings = strings()): ClipPhrase[] {
  const phrases: ClipPhrase[] = [{ text: t.caller.bust, mood: 0 }];
  const add = (words: string[], mood: Mood) => phrases.push(...words.map((text) => ({ text, mood })));

  add(callWords(t.caller.matchShot('')), 5);
  // Up to the twentieth, and once past it, where the count is left out.
  for (let count = 1; count <= 21; count += 1) {
    add(callWords(t.caller.gameShot(count, '')), 4);
    add(callWords(t.caller.setShot(count, '')), 4);
  }
  for (let total = 0; total <= 180; total += 1) add([t.caller.visit(total)], visitMood(total));
  // What a player can be left on and still be told: 170 is the highest finish.
  for (let left = 1; left <= 170; left += 1) add(callWords(t.caller.requires('', left)), 1);
  add(callWords(t.caller.toThrow('')), 1);
  for (const hit of [MISS, ...allScoringHits()]) add([t.caller.hit(hit)], hitMood(hit));

  // One recording per key, in the liveliest mood it is called in: "twenty" is
  // a calm visit total and a single twenty; "twenty-five" is also the outer bull.
  const byKey = new Map<string, ClipPhrase>();
  for (const phrase of phrases) {
    const key = clipKey(phrase.text);
    const seen = byKey.get(key);
    if (!seen || phrase.mood > seen.mood) byKey.set(key, phrase);
  }
  return [...byKey.values()];
}
