/**
 * The players: the profiles that live on this device, and the guests of this
 * session.
 *
 * A profile is a person whose darts are kept: written to IndexedDB, and in the
 * statistics for good. A guest is a person for as long as the tab is open —
 * added once and then pickable again for the next leg — but never written
 * anywhere and never in the statistics.
 */

import type { PlayerConfig } from '@treblewise/core';

import { deleteProfile, putProfile, type Profile } from '../storage/db.js';

import type { Slice } from './slice.js';

export interface PlayersState {
  /** Most recently played first as loaded; a new profile goes to the front. */
  profiles: Profile[];
  sessionGuests: PlayerConfig[];
}

export interface PlayersActions {
  /** Makes a profile and saves it; its id comes from the name, once. */
  createProfile(name: string): Promise<Profile>;
  /** Renames a profile, keeping its id and so its history. A blank name is ignored. */
  renameProfile(id: string, name: string): Promise<void>;
  removeProfile(id: string): Promise<void>;
  addSessionGuest(name: string): PlayerConfig;
  removeSessionGuest(id: string): void;
  /** The profiles among these players have just started a match. */
  played(players: readonly PlayerConfig[]): void;
}

/**
 * The id a new profile gets: the name, lower-cased with its spaces collapsed,
 * and numbered from 2 if that is taken. It is derived once, at creation, and
 * never changes again: renaming someone must not orphan their history. It is
 * also how players were named before profiles existed, which is how their old
 * matches find them (see the data migration in storage/db.ts).
 */
function idFor(name: string, profiles: readonly Profile[]): string {
  const base = name.toLowerCase().replace(/\s+/g, ' ');
  const taken = new Set(profiles.map((profile) => profile.id));
  let id = base;
  let suffix = 2;
  while (taken.has(id)) id = `${base} ${suffix++}`;
  return id;
}

export function createPlayers(state: Slice<PlayersState>): PlayersActions {
  return {
    async createProfile(name) {
      const trimmed = name.trim() || 'Player';
      const profile: Profile = {
        id: idFor(trimmed, state.get().profiles),
        name: trimmed,
        createdAt: Date.now(),
        lastPlayedAt: null,
      };
      await putProfile(profile);
      state.set({ profiles: [profile, ...state.get().profiles] });
      return profile;
    },

    async renameProfile(id, name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      const profiles = state.get().profiles.map((profile) =>
        profile.id === id ? { ...profile, name: trimmed } : profile,
      );
      state.set({ profiles });
      const changed = profiles.find((profile) => profile.id === id);
      if (changed) await putProfile(changed);
    },

    async removeProfile(id) {
      await deleteProfile(id);
      state.set({ profiles: state.get().profiles.filter((profile) => profile.id !== id) });
    },

    addSessionGuest(name) {
      // A guest keeps an id of their own so two guests in one match stay apart,
      // and `temporary` keeps them out of the statistics for good.
      const guest: PlayerConfig = {
        id: `guest-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim() || 'Guest',
        temporary: true,
      };
      state.set({ sessionGuests: [...state.get().sessionGuests, guest] });
      return guest;
    },

    removeSessionGuest(id) {
      state.set({ sessionGuests: state.get().sessionGuests.filter((guest) => guest.id !== id) });
    },

    played(players) {
      // Playing marks a profile as used, which is what orders the picker. The
      // list keeps its order for now; storage lists it by last played, so it
      // is in that order from the next load.
      const now = Date.now();
      const isPlaying = (profile: Profile) =>
        players.some((player) => player.id === profile.id && !player.temporary);
      const profiles = state.get().profiles.map((profile) =>
        isPlaying(profile) ? { ...profile, lastPlayedAt: now } : profile,
      );
      state.set({ profiles });
      for (const profile of profiles) {
        if (isPlaying(profile)) void putProfile(profile);
      }
    },
  };
}
