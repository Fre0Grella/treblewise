/**
 * Making teams in the setup: how many, and who is on which. Kept apart from
 * the screen so the dealing, moving and shuffling are plain functions.
 *
 * A draft holds only what the person chose, a team for the players they
 * placed or shuffled; everyone else is dealt onto the smallest team as they
 * join, so adding a player never leaves a team empty.
 */

import type { PlayerConfig, TeamConfig } from '@treblewise/core';

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 4;

export interface TeamDraft {
  /** Teams wanted; never more than there are players. */
  count: number;
  /** Team index by player id, for the players placed by hand or shuffled. */
  placed: Record<string, number>;
}

export const newDraft = (): TeamDraft => ({ count: MIN_TEAMS, placed: {} });

/** The teams as they stand: everyone in the lineup on one, in lineup order within it. */
export function draftTeams(lineup: readonly PlayerConfig[], draft: TeamDraft, name: (n: number) => string): TeamConfig[] {
  const count = Math.max(1, Math.min(draft.count, lineup.length));
  const members: string[][] = Array.from({ length: count }, () => []);
  const unplaced: string[] = [];
  for (const player of lineup) {
    const at = draft.placed[player.id];
    if (at !== undefined && at < count) members[at]!.push(player.id);
    else unplaced.push(player.id);
  }
  for (const id of unplaced) {
    const smallest = members.reduce((best, team, k) => (team.length < members[best]!.length ? k : best), 0);
    members[smallest]!.push(id);
  }
  // Within a team, the lineup's order is the throwing order.
  const position = (id: string) => lineup.findIndex((player) => player.id === id);
  return members.map((ids, k) => ({ id: `team-${k + 1}`, name: name(k + 1), members: [...ids].sort((a, b) => position(a) - position(b)) }));
}

/** The player moved to the next team round, keeping everyone else where they are. */
export function moveToNext(draft: TeamDraft, teams: readonly TeamConfig[], playerId: string): TeamDraft {
  const placed = Object.fromEntries(teams.flatMap((team, k) => team.members.map((id) => [id, k])));
  placed[playerId] = ((placed[playerId] ?? 0) + 1) % teams.length;
  return { ...draft, placed };
}

/** Everyone dealt onto the teams at random, as evenly as they go. */
export function shuffleTeams(draft: TeamDraft, lineup: readonly PlayerConfig[], random: () => number = Math.random): TeamDraft {
  const ids = lineup.map((player) => player.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  const count = Math.max(1, Math.min(draft.count, lineup.length));
  return { ...draft, placed: Object.fromEntries(ids.map((id, k) => [id, k % count])) };
}

/**
 * The teams in the order who throws first decided, which is decided between
 * the players (the bull, the wheel, or by hand): a team throws as early as
 * its best-placed member, and within it the members go in their places' order.
 * The closest at the bull leads their team, and their team throws first.
 */
export function orderTeams(teams: readonly TeamConfig[], order: readonly { id: string }[]): TeamConfig[] {
  const place = (id: string) => {
    const at = order.findIndex((player) => player.id === id);
    return at < 0 ? order.length : at;
  };
  const byPlace = (a: string, b: string) => place(a) - place(b);
  const best = (team: TeamConfig) => Math.min(...team.members.map(place));
  return teams.map((team) => ({ ...team, members: [...team.members].sort(byPlace) })).sort((a, b) => best(a) - best(b));
}

/** One team more or fewer, between two and four, and never more than the players. */
export function resize(draft: TeamDraft, by: 1 | -1, players: number): TeamDraft {
  const count = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, players, draft.count + by));
  return { count, placed: Object.fromEntries(Object.entries(draft.placed).filter(([, k]) => k < count)) };
}
