/**
 * The app's store: the match, the players, the settings and the lobby session
 * in one zustand store, and the screen being shown.
 *
 * Each of the four lives in a module of its own beside this file, with no
 * framework and its own tests; this store holds their state, hands each its
 * part, and keeps what is not theirs: which screen is open, until a router
 * takes that over, and the caller hooked up to the match, which says what to
 * announce and leaves the speaking to the caller.
 */

import type { Hit, PlayerConfig, Point, X01Config } from '@treblewise/core';
import { create } from 'zustand';

import { hookUpCaller } from '../caller/hookup.js';
import type { PairingConnection } from '../pairing/session.js';
import { hashForScreen, type Screen } from '../route.js';
import { DEFAULT_SETTINGS, listProfiles, loadSettings, type Profile, type Settings } from '../storage/db.js';
import { createLobbySession, recallLobbySession, type LobbySessionState, type PlayMode } from './lobbySession.js';
import { createMatches, loadMatches, type MatchesState, type ThrowOptions } from './matches.js';
import { createPlayers, type PlayersState } from './players.js';
import { createSettings, type SettingsState } from './settings.js';

export type { Screen };
export type { PhoneStatus, PlayMode } from './lobbySession.js';
export type { ThrowOptions } from './matches.js';

/**
 * The app's state, in one zustand store for now. The match, the settings, the
 * players and the lobby session each describe their own part, beside their
 * logic.
 */
interface MatchState extends MatchesState, SettingsState, PlayersState, LobbySessionState {
  ready: boolean;
  screen: Screen;
  /** Where the camera setup goes back to: the match it was opened from, if any. */
  cameraReturn: Screen | null;

  init: (screen?: Screen) => Promise<void>;
  setScreen: (screen: Screen) => void;
  /** Camera setup from the match, coming back to the match. */
  openCameraSetup: () => void;
  startMatch: (config: X01Config) => void;
  resumeMatch: (id: string) => Promise<void>;
  removeMatch: (id: string) => Promise<void>;
  refreshHistory: () => Promise<void>;

  throwDart: (hit: Hit, options?: ThrowOptions) => void;
  correctDart: (dartId: string, hit: Hit, pos?: Point) => void;
  undo: () => void;

  toggleCaller: () => void;
  toggleSounds: () => void;
  setEntryMode: (mode: Settings['entryMode']) => void;
  saveCalibration: (calibration: Settings['calibration']) => void;
  setKeepFrames: (on: boolean) => void;
  setAutoscoreGames: (on: boolean) => void;

  createProfile: (name: string) => Promise<Profile>;
  addSessionGuest: (name: string) => PlayerConfig;
  removeSessionGuest: (id: string) => void;
  renameProfile: (id: string, name: string) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  setMode: (mode: PlayMode) => void;
  setPairing: (pairing: PairingConnection, stream: MediaStream) => void;
  clearPairing: () => void;
  /** Starts a lobby session in this mode and opens the lobby. */
  enterLobby: (mode: PlayMode) => void;
  /** Ends the session (and any pairing) and goes back to the landing page. */
  leaveLobby: () => void;
  /** Where "back" goes: the lobby during a session, the landing page otherwise. */
  goHome: () => void;
}

export const useMatchStore = create<MatchState>((set, get) => {
  const matches = createMatches({ get, set });
  const settings = createSettings({ get, set });
  const players = createPlayers({ get, set });
  const lobby = createLobbySession({ get, set });
  const voice = hookUpCaller(() => get().settings.callerEnabled);

  return {
    ready: false,
    screen: 'landing',
    cameraReturn: null,
    settings: DEFAULT_SETTINGS,
    match: null,
    snapshot: null,
    history: [],
    profiles: [],
    sessionGuests: [],
    mode: 'solo',
    pairing: null,
    remoteStream: null,
    session: null,
    pairState: null,
    phone: null,

    async init(screen) {
      const [stored, loaded, profiles] = await Promise.all([loadSettings(), loadMatches(), listProfiles()]);

      // A match in progress is resumed, but the landing page still comes first
      // unless the address says otherwise: arriving at treblewise should explain what
      // it is before it drops you into someone else's half-finished leg.
      const recalled = recallLobbySession();
      const resolved: Screen = screen ?? (recalled.session ? 'lobby' : 'landing');
      set({
        ...recalled,
        ...loaded,
        ready: true,
        settings: stored,
        profiles,
        screen: resolved === 'game' && !loaded.match ? 'setup' : resolved,
      });
    },

    openCameraSetup() {
      const from = get().screen;
      get().setScreen('capture');
      set({ cameraReturn: from });
    },

    setScreen(screen) {
      set({ screen, ...(screen === 'capture' ? {} : { cameraReturn: null }) });
      if (typeof location !== 'undefined') {
        const hash = hashForScreen(screen);
        if (location.hash !== hash) history.pushState(null, '', hash);
      }
      if (screen === 'history') void get().refreshHistory();
    },

    startMatch(config) {
      players.played(config.players);
      matches.start(config);
      set({ screen: 'game' });
    },

    async resumeMatch(id) {
      if (matches.resume(id)) set({ screen: 'game' });
    },

    removeMatch: matches.remove,
    refreshHistory: matches.refreshHistory,

    throwDart(hit, options) {
      const appended = matches.throwDart(hit, options);
      if (appended) voice.heard(appended.calls);
    },

    correctDart(dartId, hit, pos) {
      const appended = matches.correctDart(dartId, hit, pos);
      if (appended) voice.heard(appended.calls);
    },

    undo() {
      if (matches.undo()) voice.hush();
    },

    toggleSounds() {
      settings.change('soundsEnabled', !get().settings.soundsEnabled);
    },

    toggleCaller() {
      const callerEnabled = !get().settings.callerEnabled;
      settings.change('callerEnabled', callerEnabled);
      if (!callerEnabled) voice.hush();
    },

    setEntryMode: (entryMode) => settings.change('entryMode', entryMode),
    saveCalibration: (calibration) => settings.change('calibration', calibration),
    setKeepFrames: (keepFrames) => settings.change('keepFrames', keepFrames),
    setAutoscoreGames: (autoscoreGames) => settings.change('autoscoreGames', autoscoreGames),

    createProfile: players.createProfile,
    renameProfile: players.renameProfile,
    removeProfile: players.removeProfile,
    addSessionGuest: players.addSessionGuest,
    removeSessionGuest: players.removeSessionGuest,

    setMode: lobby.setMode,
    setPairing: lobby.setPairing,
    clearPairing: lobby.clearPairing,

    enterLobby(mode) {
      lobby.enter(mode);
      get().setScreen('lobby');
    },

    leaveLobby() {
      lobby.leave();
      get().setScreen('landing');
    },

    goHome() {
      get().setScreen(get().session ? 'lobby' : 'landing');
    },
  };
});
