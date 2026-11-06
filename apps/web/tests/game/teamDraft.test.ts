import { describe, expect, it } from 'vitest';

import { startingWith } from '@/game/throwOrder.js';
import { draftTeams, moveToNext, newDraft, orderTeams, resize, shuffleTeams } from '@/game/teamDraft.js';

const people = ['Marco', 'Giulia', 'Dave', 'Anna', 'Luca'].map((name) => ({ id: name.toLowerCase(), name }));
const name = (n: number) => `Team ${n}`;
const ids = (teams: { members: string[] }[]) => teams.map((team) => team.members);

describe('making teams', () => {
  it('deals the lineup onto the smallest team, in lineup order', () => {
    expect(ids(draftTeams(people.slice(0, 4), newDraft(), name))).toEqual([
      ['marco', 'dave'],
      ['giulia', 'anna'],
    ]);
    expect(draftTeams(people.slice(0, 2), newDraft(), name).map((team) => team.name)).toEqual(['Team 1', 'Team 2']);
  });

  it('moves a player to the next team round, and keeps the rest where they are', () => {
    const four = people.slice(0, 4);
    const teams = draftTeams(four, newDraft(), name);
    const moved = moveToNext(newDraft(), teams, 'marco');
    expect(ids(draftTeams(four, moved, name))).toEqual([['dave'], ['marco', 'giulia', 'anna']]);
    // A newcomer joins the smaller team.
    expect(ids(draftTeams(people, moved, name))).toEqual([['dave', 'luca'], ['marco', 'giulia', 'anna']]);
  });

  it('shuffles everyone as evenly as they go', () => {
    const draft = shuffleTeams(newDraft(), people, () => 0);
    const sizes = draftTeams(people, draft, name).map((team) => team.members.length);
    expect(sizes.sort()).toEqual([2, 3]);
  });

  it('keeps between two and four teams, and no more than the players', () => {
    expect(resize(newDraft(), 1, 5).count).toBe(3);
    expect(resize({ count: 4, placed: {} }, 1, 8).count).toBe(4);
    expect(resize(newDraft(), -1, 5).count).toBe(2);
    expect(resize(newDraft(), 1, 2).count).toBe(2);
    // Players placed on a team that goes are dealt again.
    expect(resize({ count: 3, placed: { marco: 2, dave: 0 } }, -1, 5).placed).toEqual({ dave: 0 });
  });
});

describe('who throws first, in teams', () => {
  const four = people.slice(0, 4);
  const teams = draftTeams(four, newDraft(), name); // Marco & Dave v Giulia & Anna

  it('puts the team of the closest at the bull first, and the members in their order at the bull', () => {
    // Closest first: Anna, Marco, Giulia, Dave.
    const atTheBull = ['anna', 'marco', 'giulia', 'dave'].map((id) => ({ id }));
    expect(ids(orderTeams(teams, atTheBull))).toEqual([
      ['anna', 'giulia'],
      ['marco', 'dave'],
    ]);
  });

  it('starts the team of whoever the wheel stops on, with them leading it', () => {
    expect(ids(orderTeams(teams, startingWith(four, 'dave')))).toEqual([
      ['dave', 'marco'],
      ['anna', 'giulia'],
    ]);
  });
});

