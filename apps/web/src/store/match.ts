/**
 * The game store: an event log in, a folded snapshot out.
 *
 * The store never computes a rule. It appends events, asks `@treblewise/core` what
 * the match looks like now, persists, and tells the caller what to say. That
 * split is why the rules have tests and the UI does not need them.
 */

import {
  reduceMatch,
  type DartCorrectedEvent,
  type DartSource,
  type Hit,
  type MatchEvent,
  type MatchSnapshot,
  type PlayerConfig,
  type Point,
  type X01Config,
} from '@treblewise/core';
import { create } from 'zustand';

import { announce } from '../caller/announce.js';
import { caller } from '../caller/caller.js';
import { strings } from '../i18n/index.js';
import {
  DEFAULT_SETTINGS,
  deleteMatch as deleteStoredMatch,
  listMatches,
  listProfiles,
  loadSettings,
  putMatch,
  type Profile,
  type Settings,
  type StoredMatch,
} from '../storage/db.js';

import type { PairingConnection } from '../pairing/session.js';
import { hashForScreen, type Screen } from '../route.js';
import { createLobbySession, recallLobbySession, type LobbySessionState, type PlayMode } from './lobbySession.js';
import { createPlayers, type PlayersState } from './players.js';
import { createSettings, type SettingsState } from './settings.js';

export type { Screen };
export type { PhoneStatus, PlayMode } from './lobbySession.js';

export interface ThrowOptions {
  pos?: Point;
  source?: DartSource;
  confidence?: number;
  frameRef?: string;
  /** Say this dart's score as it goes in: the autoscorer's darts are called one by one. */
  call?: boolean;
}

/**
 * The app's state, in one zustand store for now. The settings, the players and
 * the lobby session each describe their own part, beside their logic.
 */
interface MatchState extends SettingsState, PlayersState, LobbySessionState {
  ready: boolean;
  screen: Screen;
  /** Where the camera setup goes back to: the match it was opened from, if any. */
  cameraReturn: Screen | null;
  match: StoredMatch | null;
  snapshot: MatchSnapshot | null;
  history: StoredMatch[];

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

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export const useMatchStore = create<MatchState>((set, get) => {
  const settings = createSettings({ get, set });
  const players = createPlayers({ get, set });
  const lobby = createLobbySession({ get, set });

  /** Applies a new event list: folds it, persists it, and calls the score. */
  const commit = (events: MatchEvent[], options: { speak?: boolean; first?: string[] } = {}) => {
    const state = get();
    if (!state.match) return;

    const previous = state.snapshot;
    const snapshot = reduceMatch(state.match.config, events);
    const match: StoredMatch = {
      ...state.match,
      events,
      updatedAt: Date.now(),
      finished: snapshot.winnerId !== null,
    };

    set({ match, snapshot });
    void putMatch(match);

    if (options.speak !== false && state.settings.callerEnabled) {
      const phrases = [...(options.first ?? []), ...announce(previous, snapshot)];
      if (phrases.length > 0) caller().sequence(phrases);
    }
  };

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
      const [stored, matches, profiles] = await Promise.all([
        loadSettings(),
        listMatches(),
        listProfiles(),
      ]);
      const unfinished = matches.find((m) => !m.finished && m.events.length > 0);

      // A match in progress is resumed, but the landing page still comes first
      // unless the address says otherwise: arriving at treblewise should explain what
      // it is before it drops you into someone else's half-finished leg.
      const recalled = recallLobbySession();
      const resolved: Screen = screen ?? (recalled.session ? 'lobby' : 'landing');
      set({
        ...recalled,
        ready: true,
        settings: stored,
        history: matches,
        profiles,
        match: unfinished ?? null,
        snapshot: unfinished ? reduceMatch(unfinished.config, unfinished.events) : null,
        screen: resolved === 'game' && !unfinished ? 'setup' : resolved,
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

      const match: StoredMatch = {
        id: newId(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        config,
        events: [],
        finished: false,
      };
      set({ match, snapshot: reduceMatch(config, []), screen: 'game' });
      void putMatch(match);
    },

    async resumeMatch(id) {
      const match = get().history.find((m) => m.id === id);
      if (!match) return;
      set({ match, snapshot: reduceMatch(match.config, match.events), screen: 'game' });
    },

    async removeMatch(id) {
      await deleteStoredMatch(id);
      const current = get().match;
      if (current?.id === id) set({ match: null, snapshot: null });
      await get().refreshHistory();
    },

    async refreshHistory() {
      set({ history: await listMatches() });
    },

    throwDart(hit, options = {}) {
      const { match, snapshot } = get();
      if (!match || !snapshot || snapshot.current === null) return;

      const event: MatchEvent = {
        type: 'dart.thrown',
        id: newId(),
        ts: Date.now(),
        hit,
        source: options.source ?? 'manual',
        ...(options.pos ? { pos: options.pos } : {}),
        ...(options.confidence !== undefined ? { confidence: options.confidence } : {}),
        ...(options.frameRef ? { frameRef: options.frameRef } : {}),
      };

      commit([...match.events, event], options.call ? { first: [strings().caller.hit(hit)] } : {});
    },

    correctDart(dartId, hit, pos) {
      const { match } = get();
      if (!match) return;

      const correction: DartCorrectedEvent = {
        type: 'dart.corrected',
        id: newId(),
        ts: Date.now(),
        target: dartId,
        hit,
        source: 'manual',
        ...(pos ? { pos } : {}),
      };

      commit([...match.events, correction], { speak: false });
    },

    undo() {
      const { match } = get();
      if (!match || match.events.length === 0) return;
      caller().cancel();
      commit(match.events.slice(0, -1), { speak: false });
    },

    toggleSounds() {
      settings.change('soundsEnabled', !get().settings.soundsEnabled);
    },

    toggleCaller() {
      const callerEnabled = !get().settings.callerEnabled;
      settings.change('callerEnabled', callerEnabled);
      if (!callerEnabled) caller().cancel();
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
