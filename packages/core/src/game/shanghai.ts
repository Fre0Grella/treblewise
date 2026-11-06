/**
 * Shanghai (issue #22): round 1 is thrown at the 1, round 2 at the 2, and so
 * on; only darts in the round's number score, at their value. The most points
 * after the last round win.
 *
 * A Shanghai, the single, the double and the treble of the round's number in
 * one visit, wins the leg on the spot when the game is set up that way.
 *
 * Level at the top after the last round, everyone throws another round at the
 * bull (25 and 50), until one player is ahead at the end of a round.
 */

import { OUTER_BULL, hit as hitOf, type Hit } from '../board/geometry.js';
import { aheadOn, reduceTurns, visitsDone, type TurnConfig, type TurnRules, type TurnSnapshot } from './turns.js';
import type { MatchEvent } from './x01.js';

export interface ShanghaiConfig extends TurnConfig {
  mode: 'shanghai';
  /** Rounds, each at its own number: 7 plays the 1 to the 7. At most 20. */
  rounds: number;
  /** A Shanghai wins the leg at once. */
  shanghaiWins: boolean;
}

export interface ShanghaiState {
  kind: 'shanghai';
  points: Record<string, number>;
  /** Who threw a Shanghai, when one won the leg. */
  shanghai: string | null;
}

export type ShanghaiSnapshot = TurnSnapshot<ShanghaiConfig, ShanghaiState>;

/** The number thrown at in a round (from 1); 25, the bull, for the tiebreak rounds after the last. */
export function shanghaiTarget(config: Pick<ShanghaiConfig, 'rounds'>, round: number): number {
  return round <= Math.min(20, config.rounds) ? round : 25;
}

/** Whether a hit scores at `target`. */
export const onShanghaiTarget = (target: number, hit: Hit) =>
  target === 25 ? hit.ring === 'bull' || hit.ring === 'outerBull' : hit.ring !== 'miss' && hit.sector === target;

function rules(config: ShanghaiConfig): TurnRules<ShanghaiConfig, ShanghaiState> {
  const rounds = Math.min(20, Math.max(1, config.rounds));

  return {
    start: (_, ids) => ({ kind: 'shanghai', points: Object.fromEntries(ids.map((id) => [id, 0])), shanghai: null }),

    dart(state, hit, { leg, visit, playerId }) {
      const target = shanghaiTarget(config, visitsDone(leg, playerId) + 1);
      if (!onShanghaiTarget(target, hit)) return { scored: 0, hits: 0 };
      state.points[playerId] = (state.points[playerId] ?? 0) + hit.value;
      if (config.shanghaiWins && target !== 25) {
        const rings = new Set(visit.darts.filter((dart) => onShanghaiTarget(target, dart.hit)).map((dart) => dart.hit.ring));
        if (rings.has('single') && rings.has('double') && rings.has('treble')) state.shanghai = playerId;
      }
      return { scored: hit.value, hits: 1 };
    },

    decide(state, { ids, leg }) {
      if (state.shanghai !== null) return { winner: state.shanghai };
      const done = ids.map((id) => visitsDone(leg, id));
      const round = Math.min(...done);
      // A round is over when everyone has thrown it; only then can points decide.
      if (round < rounds || done.some((n) => n !== round)) return null;
      const winner = aheadOn(ids, (id) => state.points[id] ?? 0);
      return winner === null ? null : { winner };
    },

    score: (state, id) => state.points[id] ?? 0,

    aim(_, id, leg) {
      const target = shanghaiTarget(config, visitsDone(leg, id) + 1);
      return target === 25 ? OUTER_BULL : hitOf(target, 'single');
    },
  };
}

export function reduceShanghai(config: ShanghaiConfig, events: readonly MatchEvent[]): ShanghaiSnapshot {
  return reduceTurns(config, events, rules(config));
}
