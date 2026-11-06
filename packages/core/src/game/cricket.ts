/**
 * Cricket (issue #22): close the 15 to 20 and the bull, three marks each,
 * and outscore the others while doing it.
 *
 * A single is a mark, a double two, a treble three; the 25 is a mark on the
 * bull and the bullseye two. Marks past the third score the number (25 for
 * the bull) while somebody else still has it open:
 *
 *  - standard: the points are the thrower's, and the highest score wins;
 *  - cut-throat: the points go to everyone who has the number open, and the
 *    lowest score wins;
 *  - no score: nothing is scored; the first to close everything wins.
 *
 * Closing everything wins the leg at once, as long as the score allows it
 * (ahead or level in standard, behind or level in cut-throat). Behind on
 * points with everything closed, a player keeps scoring until they are not.
 */

import type { Hit } from '../board/geometry.js';
import { reduceTurns, type TurnConfig, type TurnRules, type TurnSnapshot } from './turns.js';
import type { MatchEvent } from './x01.js';

/** The cricket numbers, in the order a cricket board lists them. 25 is the bull. */
export const CRICKET_NUMBERS = [20, 19, 18, 17, 16, 15, 25] as const;

/** Marks that close a number. */
export const MARKS_TO_CLOSE = 3;

export type CricketScoring = 'standard' | 'cutThroat' | 'noScore';

export interface CricketConfig extends TurnConfig {
  mode: 'cricket';
  scoring: CricketScoring;
}

export interface CricketState {
  kind: 'cricket';
  /** Marks per player per number, past three included. */
  marks: Record<string, Record<number, number>>;
  points: Record<string, number>;
}

export type CricketSnapshot = TurnSnapshot<CricketConfig, CricketState>;

/** The cricket number a hit is on and how many marks it is worth there, or null off the numbers. */
export function cricketMarks(hit: Hit): { number: number; marks: number } | null {
  if (hit.ring === 'outerBull') return { number: 25, marks: 1 };
  if (hit.ring === 'bull') return { number: 25, marks: 2 };
  if (hit.ring === 'miss' || hit.sector < 15) return null;
  return { number: hit.sector, marks: hit.ring === 'treble' ? 3 : hit.ring === 'double' ? 2 : 1 };
}

const closed = (state: CricketState, id: string, n: number) => (state.marks[id]?.[n] ?? 0) >= MARKS_TO_CLOSE;
const closedAll = (state: CricketState, id: string) => CRICKET_NUMBERS.every((n) => closed(state, id, n));

function rules(config: CricketConfig): TurnRules<CricketConfig, CricketState> {
  return {
    start: (_, ids) => ({
      kind: 'cricket',
      marks: Object.fromEntries(ids.map((id) => [id, Object.fromEntries(CRICKET_NUMBERS.map((n) => [n, 0]))])),
      points: Object.fromEntries(ids.map((id) => [id, 0])),
    }),

    dart(state, hit, { ids, playerId }) {
      const on = cricketMarks(hit);
      if (!on) return { scored: 0, hits: 0 };
      const own = state.marks[playerId]!;
      const before = own[on.number] ?? 0;
      own[on.number] = before + on.marks;
      const extra = Math.max(0, before + on.marks - Math.max(before, MARKS_TO_CLOSE));
      if (extra === 0 || config.scoring === 'noScore') return { scored: 0, hits: on.marks };

      const open = ids.filter((id) => id !== playerId && !closed(state, id, on.number));
      if (open.length === 0) return { scored: 0, hits: on.marks };
      const points = extra * on.number;
      if (config.scoring === 'standard') {
        state.points[playerId] = (state.points[playerId] ?? 0) + points;
        return { scored: points, hits: on.marks };
      }
      for (const id of open) state.points[id] = (state.points[id] ?? 0) + points;
      return { scored: 0, hits: on.marks };
    },

    decide(state, { ids, playerId }) {
      // The thrower first: in cut-throat, their points can let someone else win too.
      for (const id of [playerId, ...ids.filter((other) => other !== playerId)]) {
        if (!closedAll(state, id)) continue;
        const mine = state.points[id] ?? 0;
        const others = ids.filter((other) => other !== id).map((other) => state.points[other] ?? 0);
        if (config.scoring === 'noScore') return { winner: id };
        if (config.scoring === 'standard' && others.every((p) => mine >= p)) return { winner: id };
        if (config.scoring === 'cutThroat' && others.every((p) => mine <= p)) return { winner: id };
      }
      return null;
    },

    score: (state, id) => state.points[id] ?? 0,
  };
}

export function reduceCricket(config: CricketConfig, events: readonly MatchEvent[]): CricketSnapshot {
  return reduceTurns(config, events, rules(config));
}
