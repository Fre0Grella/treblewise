/**
 * Around the clock (issue #22): hit every number in order, the first round
 * the board wins.
 *
 * What it can be set to:
 *  - which bed counts: any, or only the singles, the doubles or the trebles;
 *  - the order: 1 to 20, 20 to 1, or round the board clockwise from the 20;
 *  - whether the bull closes it, after the last number;
 *  - hits on a number before moving on (one to three);
 *  - whether, when any bed counts, a double and a treble count two and three
 *    hits, which skips numbers ahead.
 *
 * The bull, as a target: the 25 or the bullseye when any bed counts, the 25
 * for singles, the bullseye for doubles and trebles.
 */

import { BULL, OUTER_BULL, SECTORS, hit as hitOf, type Hit } from '../board/geometry.js';
import { reduceTurns, type TurnConfig, type TurnRules, type TurnSnapshot } from './turns.js';
import type { MatchEvent } from './x01.js';

export type ClockRing = 'any' | 'single' | 'double' | 'treble';
export type ClockOrder = 'up' | 'down' | 'board';

export interface AroundTheClockConfig extends TurnConfig {
  mode: 'aroundTheClock';
  ring: ClockRing;
  order: ClockOrder;
  /** The bull is the last target. */
  bull: boolean;
  /** Hits on a target before the next one. */
  hitsPerTarget: number;
  /** A double counts two hits and a treble three (any bed only). */
  multiples: boolean;
}

export interface AroundTheClockState {
  kind: 'aroundTheClock';
  /** Hits counted so far, per player; the target is `floor(hits / hitsPerTarget)` into the sequence. */
  hits: Record<string, number>;
}

export type AroundTheClockSnapshot = TurnSnapshot<AroundTheClockConfig, AroundTheClockState>;

/** The numbers in the order they are played; 25 is the bull. */
export function clockSequence(config: Pick<AroundTheClockConfig, 'order' | 'bull'>): number[] {
  const numbers = Array.from({ length: 20 }, (_, i) => i + 1);
  const sequence = config.order === 'down' ? numbers.reverse() : config.order === 'board' ? [...SECTORS] : numbers;
  return config.bull ? [...sequence, 25] : sequence;
}

/** How many hits a dart counts for on `target` (25 is the bull). */
export function clockHits(config: Pick<AroundTheClockConfig, 'ring' | 'multiples'>, target: number, hit: Hit): number {
  if (target === 25) {
    if (hit.ring !== 'bull' && hit.ring !== 'outerBull') return 0;
    if (config.ring === 'single') return hit.ring === 'outerBull' ? 1 : 0;
    if (config.ring === 'double' || config.ring === 'treble') return hit.ring === 'bull' ? 1 : 0;
    return config.multiples && hit.ring === 'bull' ? 2 : 1;
  }
  if (hit.sector !== target || hit.ring === 'miss') return 0;
  if (config.ring !== 'any') return hit.ring === config.ring ? 1 : 0;
  if (!config.multiples) return 1;
  return hit.ring === 'treble' ? 3 : hit.ring === 'double' ? 2 : 1;
}

/** The hit to aim at for `target` under the config: what the board and the cards show. */
export function clockAim(config: Pick<AroundTheClockConfig, 'ring'>, target: number): Hit {
  if (target === 25) return config.ring === 'single' || config.ring === 'any' ? OUTER_BULL : BULL;
  return hitOf(target, config.ring === 'any' ? 'single' : config.ring);
}

/** Where a player stands: the target index in the sequence (its length once finished), and hits on it. */
export function clockProgress(config: AroundTheClockConfig, hits: number): { index: number; onTarget: number } {
  const per = Math.max(1, config.hitsPerTarget);
  const length = clockSequence(config).length;
  const index = Math.min(length, Math.floor(hits / per));
  return { index, onTarget: index >= length ? 0 : hits - index * per };
}

function rules(config: AroundTheClockConfig): TurnRules<AroundTheClockConfig, AroundTheClockState> {
  const sequence = clockSequence(config);
  const per = Math.max(1, config.hitsPerTarget);
  const total = sequence.length * per;
  const targetOf = (state: AroundTheClockState, id: string) => sequence[clockProgress(config, state.hits[id] ?? 0).index];

  return {
    start: (_, ids) => ({ kind: 'aroundTheClock', hits: Object.fromEntries(ids.map((id) => [id, 0])) }),

    dart(state, hit, { playerId }) {
      const target = targetOf(state, playerId);
      if (target === undefined) return { scored: 0, hits: 0 };
      const counted = clockHits(config, target, hit);
      state.hits[playerId] = Math.min(total, (state.hits[playerId] ?? 0) + counted);
      return { scored: 0, hits: counted };
    },

    decide: (state, { playerId }) => ((state.hits[playerId] ?? 0) >= total ? { winner: playerId } : null),

    /** Targets still to hit. */
    score: (state, id) => sequence.length - clockProgress(config, state.hits[id] ?? 0).index,

    aim(state, id) {
      const target = targetOf(state, id);
      return target === undefined ? null : clockAim(config, target);
    },
  };
}

export function reduceAroundTheClock(config: AroundTheClockConfig, events: readonly MatchEvent[]): AroundTheClockSnapshot {
  return reduceTurns(config, events, rules(config));
}
