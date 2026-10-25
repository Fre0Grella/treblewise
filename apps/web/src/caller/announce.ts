/**
 * What the caller says, derived by comparing the match before and after a dart.
 *
 * Kept separate from the speech engine and from the store so it can be tested
 * without a microphone, a browser or a game.
 */

import type { Hit, MatchSnapshot } from '@treblewise/core';

import { strings } from '../i18n/index.js';

import type { Call } from './call.js';

/**
 * A bust is heard as glass breaking (sounds.ts), and "No score" comes a beat
 * after it, the way it was picked by ear: over the shards, not over the smash.
 */
const BUST_BEAT_MS = 250;

/** The highest score "you require" is recorded for: 170, the highest double-out finish (phrases.ts). */
const MOST_REQUIRED = 170;

export interface AnnounceOptions {
  /**
   * Whether calls name the players (a setting). Without names, "you require
   * forty" is said alone, and "to throw", which says nothing without a name,
   * is not said at all.
   */
  names?: boolean;
}

function playerName(snapshot: MatchSnapshot, playerId: string): string {
  return snapshot.config.players.find((p) => p.id === playerId)?.name ?? playerId;
}

function completedVisits(snapshot: MatchSnapshot) {
  return snapshot.legs.flatMap((leg) => leg.visits).filter((visit) => visit.complete);
}

/** The visit the move from `before` to `after` completed, if it completed one. */
function visitCompleted(before: MatchSnapshot | null, after: MatchSnapshot) {
  const done = completedVisits(after);
  const doneBefore = before === null ? 0 : completedVisits(before).length;
  return done.length > doneBefore ? done.at(-1) : undefined;
}

/** Whether the dart that moved the match from `before` to `after` bust its visit. */
export function bustedBy(before: MatchSnapshot, after: MatchSnapshot): boolean {
  return visitCompleted(before, after)?.busted === true;
}

const withoutNames = (call: Call): Call => call.filter((part) => typeof part === 'string' || !('name' in part));

/**
 * The calls to make for the transition from `before` to `after`, in order.
 * Empty when nothing worth announcing happened: a dart in the middle of a visit
 * is not announced, because a caller waits until the visit is thrown.
 */
export function announce(before: MatchSnapshot | null, after: MatchSnapshot, options: AnnounceOptions = {}): Call[] {
  const t = strings();
  const names = options.names ?? true;
  const named = (call: Call) => (names ? call : withoutNames(call));

  if (after.winnerId !== null && (before === null || before.winnerId === null)) {
    return [named(t.caller.matchShot(playerName(after, after.winnerId)))];
  }

  const visit = visitCompleted(before, after);
  if (!visit) return [];

  if (visit.won) {
    const setWon = (after.setsWon[visit.playerId] ?? 0) > (before?.setsWon[visit.playerId] ?? 0);
    const name = playerName(after, visit.playerId);
    return [named(setWon ? t.caller.setShot(visit.setIndex + 1, name) : t.caller.gameShot(visit.legIndex + 1, name))];
  }

  const total = visit.darts.reduce((sum, dart) => sum + dart.scored, 0);
  const calls: Call[] = [visit.busted ? [{ pause: BUST_BEAT_MS }, t.caller.bust] : [t.caller.visit(total)]];

  // Then the player stepping up, the way a caller hands over: what they
  // require when they are on a finish ("Sofi, you require one hundred"), and
  // otherwise just that they are to throw. Alone at the board, a player hears
  // what they require before each visit, and nothing more.
  const next = after.current;
  if (next !== null) {
    const finish = next.checkout !== null && next.remaining <= MOST_REQUIRED;
    if (finish) calls.push(named(t.caller.requires(playerName(after, next.playerId), next.remaining)));
    else if (names && next.playerId !== visit.playerId) calls.push(t.caller.toThrow(playerName(after, next.playerId)));
  }

  return calls;
}

/**
 * What the caller says in the bull-off (issue #41), after a dart or, with
 * `hit` null, as it opens: the bull by name when a dart went in ("Bullseye",
 * "Twenty-five"), as a caller would, then whoever is `up`: the next to throw,
 * or once it is decided the one who throws first, the match's opening call.
 * A dart outside the bull is left to the screen; its distance is not
 * something a caller says.
 */
export function announceBull(hit: Hit | null, up: string | null, options: AnnounceOptions = {}): Call[] {
  const t = strings();
  const calls: Call[] = [];
  if (hit?.ring === 'bull' || hit?.ring === 'outerBull') calls.push([t.caller.hit(hit)]);
  if (up !== null && (options.names ?? true)) calls.push(t.caller.toThrow(up));
  return calls;
}
