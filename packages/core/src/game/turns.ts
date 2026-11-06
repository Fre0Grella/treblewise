/**
 * The engine every game but X01 is folded with (issue #22).
 *
 * A game is still a log of darts, corrections and perhaps a `match.ended`;
 * what changes from one game to another is what a dart does. So the turn
 * taking, the visits, the legs and the corrections live here once, and each
 * game brings its rules: what a dart counts for, when a visit is over, and
 * when a leg is decided. The snapshot keeps X01's shape (legs of visits of
 * darts, whose throw it is), which is what lets the camera, undo, the visit
 * sheet and the corrections work in every game unchanged.
 *
 * X01 keeps its own engine (x01.ts): it was there first, its sets and busts
 * do not fit this one, and every stored match folds through it.
 */

import type { Hit, Point } from '../board/geometry.js';
import { assignThrowers, sides, type Lineup } from './teams.js';
import {
  DARTS_PER_VISIT,
  type CurrentState,
  type Dart,
  type DartCorrectedEvent,
  type DartSource,
  type Leg,
  type MatchEvent,
  type Visit,
} from './x01.js';

/** What every game but X01 is set up with: who plays, and how many legs. Whoever throws first rotates each leg. */
export interface TurnConfig extends Lineup {
  /** Legs needed to win the match; 1 for a single game. */
  legsToWin: number;
}

/** A leg of one of these games: X01's leg, plus where the game stands. */
export interface TurnLeg<S> extends Leg {
  state: S;
  /** Decided: won, or (in a game with no tiebreak) drawn. */
  over: boolean;
}

export interface TurnCurrent extends CurrentState {
  /** The player's round in the leg, from 1: their visits so far, and this one. */
  round: number;
  /** Where to aim, when the game has one target: the dart cards and the board show it. */
  aim: Hit | null;
}

export interface TurnSnapshot<C extends TurnConfig, S> {
  config: C;
  legs: TurnLeg<S>[];
  legsWon: Record<string, number>;
  /** Won: by the last leg's winner. */
  winnerId: string | null;
  /** Ended before anyone won it (a `match.ended` event); `winnerId` is then whoever leads on legs, or null. */
  endedEarly: boolean;
  /** Over with nobody ahead: a single game that ended level. */
  drawn: boolean;
  /** Null once the match is over. */
  current: TurnCurrent | null;
}

export interface TurnContext<S> {
  /** Everyone, in throwing order. */
  ids: readonly string[];
  leg: TurnLeg<S>;
  visit: Visit;
  playerId: string;
}

/** What a game's rules are. `S` is its leg state, which the rules may change in place. */
export interface TurnRules<C extends TurnConfig, S> {
  /** A new leg. */
  start(config: C, ids: readonly string[]): S;
  /**
   * One dart. `scored` is what it is worth to the thrower, `hits` what it
   * counted for in the game; `endsVisit` takes the rest of the visit away.
   */
  dart(state: S, hit: Hit, context: TurnContext<S>): { scored: number; hits: number; endsVisit?: boolean };
  /** Darts in this player's next visit: three unless the game says otherwise. */
  visitSize?(state: S, playerId: string): number;
  /** The visit is over: settle it. True when it counts as no score. */
  visitOver?(state: S, context: TurnContext<S>): boolean;
  /**
   * Whether the leg is decided now: `{ winner }`, `{ winner: null }` for a
   * draw, or null to play on. Asked after every dart.
   */
  decide(state: S, context: TurnContext<S>): { winner: string | null } | null;
  /** The number on the player's card: points, lives, targets left. */
  score(state: S, playerId: string): number;
  /** Out of the leg: their turns are skipped. */
  out?(state: S, playerId: string): boolean;
  /** Throws again after this visit, rather than passing the throw on. */
  again?(state: S, playerId: string): boolean;
  /** Where the player should aim with the dart in hand, if one target is the point. */
  aim?(state: S, playerId: string, leg: TurnLeg<S>, dartInVisit: number): Hit | null;
}

/** The visits a player has finished in a leg. */
export function visitsDone(leg: Leg, playerId: string): number {
  return leg.visits.filter((visit) => visit.playerId === playerId && visit.complete).length;
}

function reading(event: { hit: Hit; pos?: Point; source: DartSource }) {
  return event.pos ? { hit: event.hit, pos: event.pos, source: event.source } : { hit: event.hit, source: event.source };
}

/**
 * Folds the event log of one of these games into everything the UI needs.
 * `events` must be in throwing order; the last correction of a dart wins.
 */
export function reduceTurns<C extends TurnConfig, S>(
  config: C,
  events: readonly MatchEvent[],
  rules: TurnRules<C, S>,
): TurnSnapshot<C, S> {
  if (sides(config).length === 0) throw new Error('a game needs at least one player');

  const corrections = new Map<string, DartCorrectedEvent>();
  for (const event of events) {
    if (event.type === 'dart.corrected') corrections.set(event.target, event);
  }

  const ids = sides(config).map((side) => side.id);
  const legs: TurnLeg<S>[] = [];
  const legsWon = Object.fromEntries(ids.map((id) => [id, 0])) as Record<string, number>;
  const legsToWin = Math.max(1, config.legsToWin);
  const starter = (legNumber: number) => ids[((config.startingPlayerIndex ?? 0) + legNumber) % ids.length]!;

  let winnerId: string | null = null;
  let drawn = false;
  let endedEarly = false;

  const createLeg = (): TurnLeg<S> => {
    const state = rules.start(config, ids);
    const leg: TurnLeg<S> = {
      setIndex: 0,
      legIndex: legs.length,
      startingPlayerId: starter(legs.length),
      visits: [],
      remaining: Object.fromEntries(ids.map((id) => [id, rules.score(state, id)])),
      open: Object.fromEntries(ids.map((id) => [id, true])),
      dartsThrown: Object.fromEntries(ids.map((id) => [id, 0])),
      winnerId: null,
      state,
      over: false,
    };
    legs.push(leg);
    return leg;
  };

  /** Whoever throws after `playerId`, passing over anyone out of the leg. */
  const nextPlayer = (leg: TurnLeg<S>, playerId: string): string => {
    if (rules.again?.(leg.state, playerId)) return playerId;
    const at = ids.indexOf(playerId);
    for (let step = 1; step <= ids.length; step += 1) {
      const id = ids[(at + step) % ids.length]!;
      if (!rules.out?.(leg.state, id)) return id;
    }
    return playerId;
  };

  const createVisit = (leg: TurnLeg<S>, playerId: string): Visit => {
    const score = rules.score(leg.state, playerId);
    const visit: Visit = {
      playerId,
      throwerId: playerId,
      setIndex: 0,
      legIndex: leg.legIndex,
      darts: [],
      scoreBefore: score,
      scoreAfter: score,
      busted: false,
      won: false,
      complete: false,
    };
    leg.visits.push(visit);
    return visit;
  };

  /** The first player of a leg to throw, passing over anyone the game counts out from the start. */
  const firstOf = (leg: TurnLeg<S>) =>
    rules.out?.(leg.state, leg.startingPlayerId) ? nextPlayer(leg, leg.startingPlayerId) : leg.startingPlayerId;

  let leg = createLeg();
  let visit = createVisit(leg, firstOf(leg));

  for (const event of events) {
    if (winnerId !== null || drawn) break; // darts after the match is over are ignored
    if (event.type === 'match.ended') {
      endedEarly = true;
      break;
    }
    if (event.type !== 'dart.thrown') continue;

    if (visit.complete) {
      if (leg.over) {
        leg = createLeg();
        visit = createVisit(leg, firstOf(leg));
      } else {
        visit = createVisit(leg, nextPlayer(leg, visit.playerId));
      }
    }

    const correction = corrections.get(event.id);
    const now = reading(correction ?? event);
    const playerId = visit.playerId;
    const dart: Dart = {
      id: event.id,
      ts: event.ts,
      playerId,
      hit: now.hit,
      source: now.source,
      scored: 0,
      remainingBefore: rules.score(leg.state, playerId),
      atFinish: false,
      won: false,
    };
    if (now.pos) dart.pos = now.pos;
    if (event.confidence !== undefined) dart.confidence = event.confidence;
    if (correction) {
      dart.original = { hit: event.hit, source: event.source };
      if (event.pos) dart.original.pos = event.pos;
      if (event.confidence !== undefined) dart.original.confidence = event.confidence;
    }
    visit.darts.push(dart);
    leg.dartsThrown[playerId] = (leg.dartsThrown[playerId] ?? 0) + 1;

    // Asked before the dart, which may change it (a killer number thrown for).
    const size = rules.visitSize?.(leg.state, playerId) ?? DARTS_PER_VISIT;
    const context: TurnContext<S> = { ids, leg, visit, playerId };
    const outcome = rules.dart(leg.state, now.hit, context);
    dart.scored = outcome.scored;
    dart.hits = outcome.hits;

    if (outcome.endsVisit || visit.darts.length >= size || rules.out?.(leg.state, playerId)) {
      visit.complete = true;
      visit.busted = rules.visitOver?.(leg.state, context) ?? false;
    }

    const decided = rules.decide(leg.state, context);
    for (const id of ids) leg.remaining[id] = rules.score(leg.state, id);
    visit.scoreAfter = leg.remaining[playerId]!;
    if (!decided) continue;

    visit.complete = true;
    leg.over = true;
    if (decided.winner === null) {
      if (legsToWin === 1) drawn = true;
      continue;
    }
    leg.winnerId = decided.winner;
    if (decided.winner === playerId) {
      dart.won = true;
      visit.won = true;
    }
    legsWon[decided.winner] = (legsWon[decided.winner] ?? 0) + 1;
    if (legsWon[decided.winner]! >= legsToWin) winnerId = decided.winner;
  }

  if (endedEarly) winnerId = leader(ids, legsWon);
  const over = winnerId !== null || drawn || endedEarly;
  const current = over ? null : describeCurrent();
  assignThrowers(config, legs, current);

  return { config, legs, legsWon, winnerId, endedEarly, drawn, current };

  function describeCurrent(): TurnCurrent {
    if (!visit.complete) return currentOf(leg, visit.playerId, visit.darts.length);
    if (leg.over) {
      // The next leg has not started: no dart has been thrown in it. Report it as it will be.
      const state = rules.start(config, ids);
      const next = { ...leg, state, visits: [], legIndex: leg.legIndex + 1, startingPlayerId: starter(legs.length) };
      return currentOf(next, firstOf(next), 0);
    }
    return currentOf(leg, nextPlayer(leg, visit.playerId), 0);
  }

  function currentOf(of: TurnLeg<S>, playerId: string, dartInVisit: number): TurnCurrent {
    const done = visitsDone(of, playerId);
    return {
      setIndex: 0,
      legIndex: of.legIndex,
      playerId,
      throwerId: playerId,
      dartInVisit,
      remaining: rules.score(of.state, playerId),
      checkout: null,
      round: done + 1,
      aim: rules.aim?.(of.state, playerId, of, dartInVisit) ?? null,
    };
  }
}

/** Who leads a match ended early, on legs; null when level. */
function leader(ids: readonly string[], legsWon: Record<string, number>): string | null {
  const ranked = [...ids].sort((a, b) => (legsWon[b] ?? 0) - (legsWon[a] ?? 0));
  const [first, second] = ranked;
  if (first === undefined) return null;
  if (second === undefined) return first;
  return (legsWon[first] ?? 0) === (legsWon[second] ?? 0) ? null : first;
}

/**
 * The one player ahead on `score`, highest or lowest first; null when the
 * best is shared. For the games decided on points.
 */
export function aheadOn(ids: readonly string[], score: (id: string) => number, lowest = false): string | null {
  const sign = lowest ? -1 : 1;
  const best = Math.max(...ids.map((id) => sign * score(id)));
  const top = ids.filter((id) => sign * score(id) === best);
  return top.length === 1 ? top[0]! : null;
}
