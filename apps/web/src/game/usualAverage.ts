/**
 * The leg average against the player's usual one (issue #28).
 *
 * The usual average is the 3-dart average over the profile's finished
 * matches, leaving out the match being played, so a good leg is not measured
 * against itself. A guest has none, and neither has a profile with no
 * finished match: their average stays plain.
 *
 * The colour runs on one gradient, red below, the accent's yellow around the
 * usual, green above, fully coloured `SPAN` points away; the difference is
 * written beside it too, so the colour is never the only sign.
 */

import { careerStats, reduceMatch, type PlayerConfig } from '@treblewise/core';

import type { StoredMatch } from '../storage/types.js';

/** How far from the usual, in points, the colour reaches full red or green. */
export const SPAN = 10;
/** Closer than this to the usual reads as "about usual". */
export const NEAR = 1;

/** The ends and the middle of the gradient: --red-400, --beige-300, --green-300 (global.css). */
const RED = [0xe0, 0x42, 0x5a] as const;
const YELLOW = [0xea, 0xcf, 0x75] as const;
const GREEN = [0x4f, 0xbf, 0x7f] as const;

/** Each player's usual average, or null when there is nothing to compare with. */
export function usualAverages(
  players: readonly PlayerConfig[],
  history: readonly StoredMatch[],
  playing: string | null,
): Record<string, number | null> {
  const finished = history.filter((match) => match.finished && match.id !== playing).map((match) => reduceMatch(match.config, match.events));
  return Object.fromEntries(
    players.map((player) => {
      if (player.temporary) return [player.id, null];
      const career = careerStats(finished, player.id);
      return [player.id, career.dartsThrown > 0 ? career.average : null];
    }),
  );
}

const mix = (from: readonly number[], to: readonly number[], t: number) =>
  `#${from.map((value, i) => Math.round(value + (to[i]! - value) * t).toString(16).padStart(2, '0')).join('')}`;

/** The average's colour, red to yellow to green, against the usual one. */
export function averageColour(average: number, usual: number): string {
  const t = Math.max(-1, Math.min(1, (average - usual) / SPAN));
  return t < 0 ? mix(YELLOW, RED, -t) : mix(YELLOW, GREEN, t);
}

/** The difference, signed, or null when it is within NEAR of the usual. */
export function difference(average: number, usual: number): number | null {
  const d = average - usual;
  return Math.abs(d) < NEAR ? null : d;
}
