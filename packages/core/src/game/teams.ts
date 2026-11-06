/**
 * Teams: who plays, as sides.
 *
 * A game is played between sides. Without teams a side is a player; with
 * them it is a team, whose players take its visits in turn and share its
 * score. The engines (x01.ts, turns.ts) fold the sides and never see a team:
 * they ask `sides()` who takes turns, and once the log is folded
 * `assignThrowers()` says which person threw each visit. That is what the
 * personal statistics read, so a player's darts in a pairs match count as
 * theirs.
 */

import type { CurrentState, Leg, PlayerConfig } from './x01.js';

export interface TeamConfig {
  id: string;
  name: string;
  /** Player ids, in the order they take the team's visits. */
  members: string[];
}

/** Who plays a game: the players, and the teams they make up, if any. */
export interface Lineup {
  /** The people playing, each once. */
  players: PlayerConfig[];
  /** The teams; absent or empty, every player is a side of their own. */
  teams?: TeamConfig[];
  /** Index into `sides()` of whoever throws first in the match. */
  startingPlayerIndex?: number;
}

export const hasTeams = (lineup: Lineup): boolean => (lineup.teams?.length ?? 0) > 0;

/** The sides that take turns, in throwing order: the teams, or else the players. */
export function sides(lineup: Lineup): PlayerConfig[] {
  return hasTeams(lineup) ? lineup.teams!.map((team) => ({ id: team.id, name: team.name })) : lineup.players;
}

/** The side a player plays for: their team's id, or their own. */
export function sideOf(lineup: Lineup, playerId: string): string {
  return lineup.teams?.find((team) => team.members.includes(playerId))?.id ?? playerId;
}

/** The people on a side, in throwing order: a team's members, or the player alone. */
export function membersOf(lineup: Lineup, sideId: string): PlayerConfig[] {
  const team = lineup.teams?.find((candidate) => candidate.id === sideId);
  const ids = team ? team.members : [sideId];
  return ids.flatMap((id) => lineup.players.filter((player) => player.id === id));
}

/**
 * Says who threw each visit, and who throws next: a team's members take its
 * visits in turn, all through the match, so everyone throws as often. Without
 * teams the thrower is the side. Fills in `throwerId` in place, after a fold.
 */
export function assignThrowers(lineup: Lineup, legs: readonly Leg[], current: CurrentState | null): void {
  const thrown: Record<string, number> = {};
  const nth = (sideId: string, index: number) => {
    const members = lineup.teams?.find((team) => team.id === sideId)?.members;
    return members && members.length > 0 ? members[index % members.length]! : sideId;
  };

  let last: { sideId: string; throwerId: string; complete: boolean } | null = null;
  for (const leg of legs) {
    for (const visit of leg.visits) {
      const index = thrown[visit.playerId] ?? 0;
      thrown[visit.playerId] = index + 1;
      visit.throwerId = nth(visit.playerId, index);
      last = { sideId: visit.playerId, throwerId: visit.throwerId, complete: visit.complete };
    }
  }

  if (!current) return;
  // A visit still open (X01 opens one before its first dart) is the one
  // being thrown; otherwise the side's next in turn steps up.
  const throwing = last !== null && !last.complete && last.sideId === current.playerId;
  current.throwerId = throwing ? last!.throwerId : nth(current.playerId, thrown[current.playerId] ?? 0);
}
