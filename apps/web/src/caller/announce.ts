/**
 * What the caller says, derived by comparing the match before and after a dart.
 *
 * Kept separate from the speech engine and from the store so it can be tested
 * without a microphone, a browser or a game.
 */

import type { MatchSnapshot } from '@treblewise/core';

import { strings } from '../i18n/index.js';

import type { Call } from './call.js';

function playerName(snapshot: MatchSnapshot, playerId: string): string {
  return snapshot.config.players.find((p) => p.id === playerId)?.name ?? playerId;
}

function completedVisits(snapshot: MatchSnapshot) {
  return snapshot.legs.flatMap((leg) => leg.visits).filter((visit) => visit.complete);
}

/**
 * The calls to make for the transition from `before` to `after`, in order.
 * Empty when nothing worth announcing happened: a dart in the middle of a visit
 * is not announced, because a caller waits until the visit is thrown.
 */
export function announce(before: MatchSnapshot | null, after: MatchSnapshot): Call[] {
  const t = strings();

  if (after.winnerId !== null && (before === null || before.winnerId === null)) {
    return [t.caller.matchShot(playerName(after, after.winnerId))];
  }

  const done = completedVisits(after);
  const doneBefore = before === null ? 0 : completedVisits(before).length;
  if (done.length <= doneBefore) return [];

  const visit = done.at(-1);
  if (!visit) return [];

  if (visit.won) {
    const setWon = (after.setsWon[visit.playerId] ?? 0) > (before?.setsWon[visit.playerId] ?? 0);
    const name = playerName(after, visit.playerId);
    return [setWon ? t.caller.setShot(visit.setIndex + 1, name) : t.caller.gameShot(visit.legIndex + 1, name)];
  }

  const total = visit.darts.reduce((sum, dart) => sum + dart.scored, 0);
  const calls: Call[] = [[visit.busted ? t.caller.bust : t.caller.visit(total)]];

  // Then what the player who just threw is left on — them, not the next player.
  // Hearing "you require thirty-two" while walking back from the board is the
  // whole point of the caller; hearing the opponent's remaining is noise.
  if (visit.scoreAfter <= 170) {
    calls.push(t.caller.requires(playerName(after, visit.playerId), visit.scoreAfter));
  } else {
    const next = after.current;
    if (next !== null && next.playerId !== visit.playerId) {
      calls.push(t.caller.toThrow(playerName(after, next.playerId)));
    }
  }

  return calls;
}
