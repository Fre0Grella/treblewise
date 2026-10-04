import { beforeEach, describe, expect, it } from 'vitest';

import { deleteProfile, listProfiles, saveSetting } from '../storage/db.js';
import type { Slice } from './slice.js';
import { createPlayers, type PlayersState } from './players.js';

function held(initial: Partial<PlayersState> = {}): Slice<PlayersState> {
  let state: PlayersState = { profiles: [], sessionGuests: [], ...initial };
  return { get: () => state, set: (patch) => (state = { ...state, ...patch }) };
}

describe('the players', () => {
  beforeEach(async () => {
    await saveSetting('profilesSeeded', true);
    for (const profile of await listProfiles()) await deleteProfile(profile.id);
  });

  it('makes a profile whose id comes from its name, and saves it', async () => {
    const state = held();
    const profile = await createPlayers(state).createProfile('  Marco   Galeri ');

    expect(profile).toMatchObject({ id: 'marco galeri', name: 'Marco   Galeri', lastPlayedAt: null });
    expect(state.get().profiles).toEqual([profile]);
    expect(await listProfiles()).toEqual([profile]);
  });

  it('numbers an id that is taken, and puts the new profile first', async () => {
    const state = held();
    const players = createPlayers(state);
    await players.createProfile('Ann');
    await players.createProfile('ann');
    const third = await players.createProfile('ANN');

    expect(third.id).toBe('ann 3');
    expect(state.get().profiles.map((profile) => profile.id)).toEqual(['ann 3', 'ann 2', 'ann']);
  });

  it('calls a profile with no name Player', async () => {
    expect((await createPlayers(held()).createProfile('   ')).name).toBe('Player');
  });

  it('renames a profile without changing its id, and ignores a blank name', async () => {
    const state = held();
    const players = createPlayers(state);
    await players.createProfile('Marco');

    await players.renameProfile('marco', ' Marco G. ');
    expect(state.get().profiles).toMatchObject([{ id: 'marco', name: 'Marco G.' }]);
    expect((await listProfiles())[0]!.name).toBe('Marco G.');

    await players.renameProfile('marco', '  ');
    expect(state.get().profiles[0]!.name).toBe('Marco G.');
  });

  it('removes a profile from the list and from storage', async () => {
    const state = held();
    const players = createPlayers(state);
    await players.createProfile('Ann');
    await players.createProfile('Bob');

    await players.removeProfile('ann');
    expect(state.get().profiles.map((profile) => profile.id)).toEqual(['bob']);
    expect((await listProfiles()).map((profile) => profile.id)).toEqual(['bob']);
  });

  it('marks the profiles that start a match as played, and nobody else', async () => {
    const state = held();
    const players = createPlayers(state);
    await players.createProfile('Ann');
    await players.createProfile('Bob');

    players.played([{ id: 'ann', name: 'Ann' }, { id: 'bob', name: 'Bob', temporary: true }]);

    const [bob, ann] = state.get().profiles;
    expect(ann!.lastPlayedAt).not.toBeNull();
    expect(bob!.lastPlayedAt).toBeNull();
    // Saved, so the next load lists Ann first.
    expect((await listProfiles()).map((profile) => profile.id)).toEqual(['ann', 'bob']);
  });

  it('keeps guests for the session only, each with an id of their own', async () => {
    const state = held();
    const players = createPlayers(state);
    const dave = players.addSessionGuest(' Dave ');
    const other = players.addSessionGuest('');

    expect(dave).toMatchObject({ name: 'Dave', temporary: true });
    expect(other.name).toBe('Guest');
    expect(dave.id).not.toBe(other.id);
    expect(state.get().sessionGuests).toEqual([dave, other]);
    expect(await listProfiles()).toEqual([]);

    players.removeSessionGuest(dave.id);
    expect(state.get().sessionGuests).toEqual([other]);
  });
});
