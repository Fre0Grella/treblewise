/**
 * The app's Pinia stores: one per module beside this file (the match, the
 * players, the settings, the lobby session). Each holds its module's state and
 * hands the module a slice of it; the logic stays in the module.
 *
 * Nothing here navigates: which screen comes next is the router's, and the
 * screens ask it.
 */

import type { Hit, Point, X01Config } from '@treblewise/core';
import { defineStore } from 'pinia';

import { hookUpCaller } from '../caller/hookup.js';
import type { PairingConnection } from '../pairing/session.js';
import { DEFAULT_SETTINGS, listProfiles, loadSettings, type Settings } from '../storage/db.js';
import { createLobbySession, recallLobbySession, type LobbySessionState, type PlayMode } from './lobbySession.js';
import { createMatches, loadMatches, type MatchesState, type ThrowOptions } from './matches.js';
import { createPlayers, type PlayersState } from './players.js';
import { refSlice, refsOf } from './refSlice.js';
import { createSettings, type SettingsState } from './settings.js';

export type { PhoneStatus, PlayMode } from './lobbySession.js';
export type { ThrowOptions } from './matches.js';

export const useSettingsStore = defineStore('settings', () => {
  const state = refsOf<SettingsState>({ settings: DEFAULT_SETTINGS });
  const settings = createSettings(refSlice(state));

  return {
    ...state,
    change: settings.change,
    toggleSounds: () => settings.change('soundsEnabled', !state.settings.value.soundsEnabled),
    toggleCaller() {
      const on = !state.settings.value.callerEnabled;
      settings.change('callerEnabled', on);
      if (!on) useMatchesStore().hush();
    },
    setEntryMode: (mode: Settings['entryMode']) => settings.change('entryMode', mode),
    saveCalibration: (calibration: Settings['calibration']) => settings.change('calibration', calibration),
    setKeepFrames: (on: boolean) => settings.change('keepFrames', on),
    setAutoscoreGames: (on: boolean) => settings.change('autoscoreGames', on),
  };
});

export const usePlayersStore = defineStore('players', () => {
  const state = refsOf<PlayersState>({ profiles: [], sessionGuests: [] });
  const players = createPlayers(refSlice(state));
  return { ...state, ...players };
});

export const useMatchesStore = defineStore('matches', () => {
  const state = refsOf<MatchesState>({ match: null, snapshot: null, history: [] });
  const matches = createMatches(refSlice(state));
  // The match says what to announce; the caller, if it is on, says it.
  const voice = hookUpCaller(() => useSettingsStore().settings.callerEnabled);

  return {
    ...state,
    start(config: X01Config) {
      usePlayersStore().played(config.players);
      matches.start(config);
    },
    resume: matches.resume,
    remove: matches.remove,
    refreshHistory: matches.refreshHistory,
    throwDart(hit: Hit, options?: ThrowOptions) {
      const appended = matches.throwDart(hit, options);
      if (appended) voice.heard(appended.calls);
    },
    correctDart(dartId: string, hit: Hit, pos?: Point) {
      const appended = matches.correctDart(dartId, hit, pos);
      if (appended) voice.heard(appended.calls);
    },
    undo() {
      if (matches.undo()) voice.hush();
    },
    hush: () => voice.hush(),
  };
});

export const useLobbyStore = defineStore('lobby', () => {
  const state = refsOf<LobbySessionState>({
    mode: 'solo',
    session: null,
    pairing: null,
    remoteStream: null,
    pairState: null,
    phone: null,
  });
  const lobby = createLobbySession(refSlice(state));
  return {
    ...state,
    setMode: (mode: PlayMode) => lobby.setMode(mode),
    setPairing: (pairing: PairingConnection, stream: MediaStream) => lobby.setPairing(pairing, stream),
    clearPairing: lobby.clearPairing,
    enter: lobby.enter,
    leave: lobby.leave,
  };
});

/**
 * Fills the stores from storage, once, before the first screen shows. A match
 * left unfinished is resumed; the session this tab was in is recalled.
 */
export async function loadStores(): Promise<void> {
  const [settings, matches, profiles] = await Promise.all([loadSettings(), loadMatches(), listProfiles()]);
  useSettingsStore().settings = settings;
  usePlayersStore().profiles = profiles;
  const store = useMatchesStore();
  store.match = matches.match;
  store.snapshot = matches.snapshot;
  store.history = matches.history;
  const lobby = useLobbyStore();
  const recalled = recallLobbySession();
  lobby.session = recalled.session;
  lobby.mode = recalled.mode;
}
