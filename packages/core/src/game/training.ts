/**
 * The training games (issue #22), each one game long, alone or against
 * others: whoever ends with most points wins, and a level finish is a draw.
 *
 *  - Bob's 27, the doubles drill: start on 27; round n is three darts at
 *    double n (the bull after the 20, if it is played). Each double hit adds
 *    its value; a round with none takes the double's value away. Reaching
 *    zero or less ends the game for that player, unless it is set to play on.
 *  - Halve-it: a round per target (numbers, any double, any treble, the
 *    bull); darts on the target score their value, and a round with none
 *    halves the score, rounded down.
 *  - Count-up: so many rounds, every dart scores its value: a scoring drill.
 */

import { BULL, OUTER_BULL, hit as hitOf, type Hit } from '../board/geometry.js';
import { aheadOn, reduceTurns, visitsDone, type TurnConfig, type TurnLeg, type TurnRules, type TurnSnapshot } from './turns.js';
import type { MatchEvent } from './x01.js';

/** The players still throwing, and whether the game is over for everyone. */
function roundsOver<S>(ids: readonly string[], leg: TurnLeg<S>, rounds: number, out: (id: string) => boolean): boolean {
  return ids.every((id) => out(id) || visitsDone(leg, id) >= rounds);
}

const byPoints = (ids: readonly string[], points: Record<string, number>) => ({ winner: aheadOn(ids, (id) => points[id] ?? 0) });

// ---------- Bob's 27 ----------

export interface Bobs27Config extends TurnConfig {
  mode: 'bobs27';
  /** The bull is the last round. */
  bull: boolean;
  /** Below zero, play on rather than stop. */
  playOn: boolean;
}

export interface Bobs27State {
  kind: 'bobs27';
  points: Record<string, number>;
  /** Out of the game: reached zero or less. */
  out: Record<string, boolean>;
}

export type Bobs27Snapshot = TurnSnapshot<Bobs27Config, Bobs27State>;

export const BOBS27_START = 27;

/** The double of a round, from 1: D1 to D20, then the bull (sector 25). */
export function bobs27Target(round: number): number {
  return round <= 20 ? round : 25;
}

export const bobs27Rounds = (config: Pick<Bobs27Config, 'bull'>) => (config.bull ? 21 : 20);

const isDoubleOf = (target: number, hit: Hit) => (target === 25 ? hit.ring === 'bull' : hit.ring === 'double' && hit.sector === target);
const doubleValue = (target: number) => (target === 25 ? 50 : target * 2);

function bobs27Rules(config: Bobs27Config): TurnRules<Bobs27Config, Bobs27State> {
  const rounds = bobs27Rounds(config);
  const targetOf = (leg: TurnLeg<Bobs27State>, id: string) => bobs27Target(visitsDone(leg, id) + 1);
  return {
    start: (_, ids) => ({
      kind: 'bobs27',
      points: Object.fromEntries(ids.map((id) => [id, BOBS27_START])),
      out: Object.fromEntries(ids.map((id) => [id, false])),
    }),
    out: (state, id) => state.out[id] === true,
    dart(state, hit, { leg, playerId }) {
      const target = targetOf(leg, playerId);
      if (!isDoubleOf(target, hit)) return { scored: 0, hits: 0 };
      state.points[playerId] = (state.points[playerId] ?? 0) + hit.value;
      return { scored: hit.value, hits: 1 };
    },
    visitOver(state, { leg, visit, playerId }) {
      if (visit.darts.some((dart) => (dart.hits ?? 0) > 0)) return false;
      // The visit is complete already, so its round is the last one done.
      state.points[playerId] = (state.points[playerId] ?? 0) - doubleValue(bobs27Target(visitsDone(leg, playerId)));
      if (!config.playOn && state.points[playerId]! <= 0) state.out[playerId] = true;
      return true;
    },
    decide: (state, { ids, leg }) =>
      roundsOver(ids, leg, rounds, (id) => state.out[id] === true) ? byPoints(ids, state.points) : null,
    score: (state, id) => state.points[id] ?? 0,
    aim: (_, id, leg) => {
      const target = targetOf(leg, id);
      return target === 25 ? BULL : hitOf(target, 'double');
    },
  };
}

export function reduceBobs27(config: Bobs27Config, events: readonly MatchEvent[]): Bobs27Snapshot {
  return reduceTurns({ ...config, legsToWin: 1 }, events, bobs27Rules(config)) as Bobs27Snapshot;
}

// ---------- Halve-it ----------

/** A Halve-it round's target: a number (any bed), any double, any treble, or the bull (25 or 50). */
export type HalveTarget = number | 'double' | 'treble' | 'bull';

export type HalveItPreset = 'classic' | 'long';

export const HALVE_IT_TARGETS: Record<HalveItPreset, readonly HalveTarget[]> = {
  classic: [15, 16, 'double', 17, 18, 'treble', 19, 20, 'bull'],
  long: [12, 13, 14, 'double', 15, 16, 17, 'treble', 18, 19, 20, 'bull'],
};

export interface HalveItConfig extends TurnConfig {
  mode: 'halveIt';
  preset: HalveItPreset;
}

export interface HalveItState {
  kind: 'halveIt';
  points: Record<string, number>;
}

export type HalveItSnapshot = TurnSnapshot<HalveItConfig, HalveItState>;

export function onHalveTarget(target: HalveTarget, hit: Hit): boolean {
  if (target === 'bull') return hit.ring === 'bull' || hit.ring === 'outerBull';
  if (target === 'double') return hit.ring === 'double' || hit.ring === 'bull';
  if (target === 'treble') return hit.ring === 'treble';
  return hit.ring !== 'miss' && hit.sector === target;
}

function halveTargetAim(target: HalveTarget): Hit | null {
  if (target === 'bull') return OUTER_BULL;
  if (typeof target === 'number') return hitOf(target, 'single');
  return null;
}

function halveItRules(config: HalveItConfig): TurnRules<HalveItConfig, HalveItState> {
  const targets = HALVE_IT_TARGETS[config.preset] ?? HALVE_IT_TARGETS.classic;
  const targetOf = (leg: TurnLeg<HalveItState>, id: string) => targets[Math.min(targets.length - 1, visitsDone(leg, id))]!;
  return {
    start: (_, ids) => ({ kind: 'halveIt', points: Object.fromEntries(ids.map((id) => [id, 0])) }),
    dart(state, hit, { leg, playerId }) {
      if (!onHalveTarget(targetOf(leg, playerId), hit)) return { scored: 0, hits: 0 };
      state.points[playerId] = (state.points[playerId] ?? 0) + hit.value;
      return { scored: hit.value, hits: 1 };
    },
    visitOver(state, { visit, playerId }) {
      if (visit.darts.some((dart) => (dart.hits ?? 0) > 0)) return false;
      state.points[playerId] = Math.floor((state.points[playerId] ?? 0) / 2);
      return true;
    },
    decide: (state, { ids, leg }) => (roundsOver(ids, leg, targets.length, () => false) ? byPoints(ids, state.points) : null),
    score: (state, id) => state.points[id] ?? 0,
    aim: (_, id, leg) => halveTargetAim(targetOf(leg, id)),
  };
}

export function reduceHalveIt(config: HalveItConfig, events: readonly MatchEvent[]): HalveItSnapshot {
  return reduceTurns({ ...config, legsToWin: 1 }, events, halveItRules(config)) as HalveItSnapshot;
}

/** The target of a Halve-it round, from 1. */
export function halveItTarget(config: Pick<HalveItConfig, 'preset'>, round: number): HalveTarget {
  const targets = HALVE_IT_TARGETS[config.preset] ?? HALVE_IT_TARGETS.classic;
  return targets[Math.min(targets.length, Math.max(1, round)) - 1]!;
}

// ---------- Count-up ----------

export interface CountUpConfig extends TurnConfig {
  mode: 'countUp';
  rounds: number;
}

export interface CountUpState {
  kind: 'countUp';
  points: Record<string, number>;
}

export type CountUpSnapshot = TurnSnapshot<CountUpConfig, CountUpState>;

function countUpRules(config: CountUpConfig): TurnRules<CountUpConfig, CountUpState> {
  const rounds = Math.max(1, config.rounds);
  return {
    start: (_, ids) => ({ kind: 'countUp', points: Object.fromEntries(ids.map((id) => [id, 0])) }),
    dart(state, hit, { playerId }) {
      state.points[playerId] = (state.points[playerId] ?? 0) + hit.value;
      return { scored: hit.value, hits: hit.value > 0 ? 1 : 0 };
    },
    decide: (state, { ids, leg }) => (roundsOver(ids, leg, rounds, () => false) ? byPoints(ids, state.points) : null),
    score: (state, id) => state.points[id] ?? 0,
  };
}

export function reduceCountUp(config: CountUpConfig, events: readonly MatchEvent[]): CountUpSnapshot {
  return reduceTurns({ ...config, legsToWin: 1 }, events, countUpRules(config)) as CountUpSnapshot;
}
