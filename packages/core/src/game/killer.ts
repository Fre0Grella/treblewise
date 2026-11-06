/**
 * Killer (issue #22): everyone has a number and some lives. Hit your own
 * number to become a killer; a killer takes lives off whoever owns the
 * numbers they hit. The last player with a life wins.
 *
 * What it can be set to:
 *  - lives;
 *  - which bed counts: the doubles (the pub game), or any bed, where a
 *    single counts one, a double two and a treble three;
 *  - hits on your own number to become a killer;
 *  - whether a killer who hits their own number loses those lives;
 *  - how the numbers are given out: drawn when the game is set up (stored in
 *    the config, so the log still folds the same way), or thrown: each player
 *    throws one dart, with the other hand if they like, at the start of the
 *    leg, and keeps the number it lands in. A dart off the numbers, or in one
 *    already taken, is thrown again.
 *
 * Alone, the game is won by becoming a killer.
 */

import { hit as hitOf, type Hit } from '../board/geometry.js';
import { reduceTurns, type TurnConfig, type TurnRules, type TurnSnapshot } from './turns.js';
import type { MatchEvent } from './x01.js';

export type KillerRing = 'double' | 'any';

export interface KillerConfig extends TurnConfig {
  mode: 'killer';
  lives: number;
  ring: KillerRing;
  /** Hits on your own number to become a killer. */
  hitsToKill: number;
  /** A killer hitting their own number loses lives. */
  selfHit: boolean;
  numbers: 'drawn' | 'thrown';
  /** The drawn numbers, by player id, when `numbers` is `drawn`. */
  assigned?: Record<string, number>;
}

export interface KillerState {
  kind: 'killer';
  /** Each player's number; null until it is thrown for. */
  number: Record<string, number | null>;
  lives: Record<string, number>;
  /** Hits on their own number so far; a killer at `hitsToKill`. */
  charge: Record<string, number>;
}

export type KillerSnapshot = TurnSnapshot<KillerConfig, KillerState>;

/** How many hits a dart counts on its number under the ring rule; 0 off the numbers. */
export function killerHits(ring: KillerRing, hit: Hit): number {
  if (hit.sector < 1 || hit.sector > 20) return 0;
  if (ring === 'double') return hit.ring === 'double' ? 1 : 0;
  return hit.ring === 'treble' ? 3 : hit.ring === 'double' ? 2 : hit.ring === 'single' ? 1 : 0;
}

/** Distinct numbers for the players, drawn at random: what a `drawn` game stores. */
export function drawKillerNumbers(ids: readonly string[], random: () => number = Math.random): Record<string, number> {
  const pool = Array.from({ length: 20 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return Object.fromEntries(ids.map((id, i) => [id, pool[i % 20]!]));
}

export const isKiller = (config: Pick<KillerConfig, 'hitsToKill'>, state: KillerState, id: string) =>
  (state.charge[id] ?? 0) >= Math.max(1, config.hitsToKill);

function rules(config: KillerConfig): TurnRules<KillerConfig, KillerState> {
  const toKill = Math.max(1, config.hitsToKill);
  const alive = (state: KillerState, id: string) => (state.lives[id] ?? 0) > 0;

  return {
    start: (_, ids) => ({
      kind: 'killer',
      number: Object.fromEntries(ids.map((id) => [id, config.numbers === 'drawn' ? (config.assigned?.[id] ?? null) : null])),
      lives: Object.fromEntries(ids.map((id) => [id, Math.max(1, config.lives)])),
      charge: Object.fromEntries(ids.map((id) => [id, 0])),
    }),

    // Throwing for a number is a visit of one dart.
    visitSize: (state, id) => (state.number[id] === null ? 1 : 3),
    again: (state, id) => state.number[id] === null,
    out: (state, id) => !alive(state, id),

    dart(state, hit, { ids, playerId }) {
      if (state.number[playerId] === null) {
        const taken = ids.some((id) => state.number[id] === hit.sector);
        if (hit.sector >= 1 && hit.sector <= 20 && hit.ring !== 'miss' && !taken) state.number[playerId] = hit.sector;
        return { scored: 0, hits: 0 };
      }
      const count = killerHits(config.ring, hit);
      if (count === 0) return { scored: 0, hits: 0 };
      const owner = ids.find((id) => state.number[id] === hit.sector);
      if (owner === undefined) return { scored: 0, hits: 0 };

      if (owner === playerId) {
        if (!isKiller(config, state, playerId)) {
          state.charge[playerId] = Math.min(toKill, (state.charge[playerId] ?? 0) + count);
          return { scored: 0, hits: count };
        }
        if (!config.selfHit) return { scored: 0, hits: 0 };
        state.lives[playerId] = Math.max(0, (state.lives[playerId] ?? 0) - count);
        return { scored: 0, hits: count, endsVisit: !alive(state, playerId) };
      }
      if (!isKiller(config, state, playerId) || !alive(state, owner)) return { scored: 0, hits: 0 };
      state.lives[owner] = Math.max(0, (state.lives[owner] ?? 0) - count);
      return { scored: 0, hits: count };
    },

    decide(state, { ids }) {
      if (ids.length === 1) return isKiller(config, state, ids[0]!) ? { winner: ids[0]! } : null;
      const standing = ids.filter((id) => alive(state, id));
      if (standing.length === 1) return { winner: standing[0]! };
      return standing.length === 0 ? { winner: null } : null;
    },

    score: (state, id) => state.lives[id] ?? 0,

    aim(state, id) {
      const own = state.number[id];
      if (own == null || isKiller(config, state, id)) return null;
      return hitOf(own, config.ring === 'double' ? 'double' : 'single');
    },
  };
}

export function reduceKiller(config: KillerConfig, events: readonly MatchEvent[]): KillerSnapshot {
  return reduceTurns(config, events, rules(config));
}
