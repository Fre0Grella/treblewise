/**
 * How the screens and the caller name who plays, with or without teams
 * (core game/teams.ts): the sides, the person at the oche, a team's members
 * under its name. One place, so the X01 screen, the other games' screen, the
 * caller and the history all say it the same way.
 */

import { hasTeams, membersOf, sides, type Lineup } from '@treblewise/core';

import { fill, strings } from '../i18n/index.js';

/** A team's member on its card: `on` for the one at the oche. */
export interface MemberChip {
  id: string;
  name: string;
  on: boolean;
}

/** A side's name: the team's, or the player's. */
export function sideName(lineup: Lineup, sideId: string): string {
  return sides(lineup).find((side) => side.id === sideId)?.name ?? '';
}

/** A person's name; a side's when the id is a side's (a player alone is both). */
export function personName(lineup: Lineup, id: string): string {
  return lineup.players.find((player) => player.id === id)?.name ?? sideName(lineup, id);
}

/** Who is at the oche, as the heading says it: "Anna (Team 2)", or "Anna". */
export function atOche(lineup: Lineup, sideId: string, throwerId: string): string {
  if (!hasTeams(lineup)) return sideName(lineup, sideId);
  return fill(strings().setup.teams.atOche, { name: personName(lineup, throwerId), team: sideName(lineup, sideId) });
}

/** A team's members for its card, the one at the oche marked; null for a player alone. */
export function teamMembers(lineup: Lineup, sideId: string, throwerId: string | null): MemberChip[] | null {
  if (!hasTeams(lineup)) return null;
  return membersOf(lineup, sideId).map((player) => ({ id: player.id, name: player.name, on: player.id === throwerId }));
}

/** Who plays, in a line: "Marco v Giulia", or with teams "Marco & Giulia v Dave & Anna". */
export function lineupLabel(lineup: Lineup): string {
  return sides(lineup)
    .map((side) => (hasTeams(lineup) ? membersOf(lineup, side.id).map((player) => player.name).join(' & ') : side.name))
    .join(' v ');
}
