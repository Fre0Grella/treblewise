/**
 * The lobby session (see CONTEXT.md): how this tab is playing, solo or paired,
 * and for two devices the connection to the phone, how it is doing and what
 * the phone last said about itself.
 *
 * All of it outlives the screen that set it up. The pairing screen hands the
 * connection over and is gone; from then on this module owns it and keeps the
 * lobby told, so going to camera setup and back never drops the phone.
 */

import type { PairState, PairingConnection } from '../pairing/session.js';

import type { Slice } from './slice.js';

/** Solo: the phone does everything. Paired: a phone films, a laptop thinks. */
export type PlayMode = 'solo' | 'paired';

/** What the paired phone last said about itself. */
export interface PhoneStatus {
  battery?: number;
  charging?: boolean;
  width?: number;
  height?: number;
}

export interface LobbySessionState {
  mode: PlayMode;
  /**
   * Set once a mode is chosen (and, for two devices, the phone is connected).
   * While there is one, every screen goes back to the lobby rather than to the
   * landing page, so nobody pairs twice by accident.
   */
  session: PlayMode | null;
  /** The paired phone, when there is one. Never persisted: it is a live socket. */
  pairing: PairingConnection | null;
  /** The video coming from the paired phone. */
  remoteStream: MediaStream | null;
  pairState: PairState | null;
  phone: PhoneStatus | null;
}

export interface LobbySessionActions {
  setMode(mode: PlayMode): void;
  /** Takes over a connected phone and its video. */
  setPairing(pairing: PairingConnection, stream: MediaStream): void;
  /** Lets go of the phone, closing the connection. */
  clearPairing(): void;
  /** Starts a session in this mode, remembered for the tab. */
  enter(mode: PlayMode): void;
  /** Ends the session and any pairing. */
  leave(): void;
}

/**
 * Remembered for the tab only, so a reload can say "you were paired, the phone
 * is gone" instead of pretending nothing happened. The connection itself
 * cannot survive a reload. The key keeps the project's old name, so a tab
 * open across the rename still finds it.
 */
const SESSION_KEY = 'oche.session';

function remember(session: PlayMode | null): void {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, session);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // No storage (private window, tests): the lobby simply starts fresh.
  }
}

/** The session this tab was in before a reload, if any, and the mode it implies. */
export function recallLobbySession(): Pick<LobbySessionState, 'session' | 'mode'> {
  let session: PlayMode | null = null;
  try {
    const value = sessionStorage.getItem(SESSION_KEY);
    if (value === 'solo' || value === 'paired') session = value;
  } catch {
    // No storage: nothing to recall.
  }
  return { session, mode: session ?? 'solo' };
}

export function createLobbySession(state: Slice<LobbySessionState>): LobbySessionActions {
  const clearPairing = () => {
    const { pairing } = state.get();
    if (pairing) {
      pairing.onState = null;
      pairing.onMessage = null;
      pairing.close();
    }
    state.set({ pairing: null, remoteStream: null, pairState: null, phone: null });
  };

  return {
    setMode(mode) {
      state.set({ mode });
      if (mode === 'solo') clearPairing();
    },

    setPairing(pairing, remoteStream) {
      state.set({ pairing, remoteStream, mode: 'paired', pairState: pairing.state, phone: null });
      // A connection that has since been replaced or cleared is no longer
      // ours, and must not overwrite the one that is.
      const current = () => state.get().pairing === pairing;
      pairing.onState = (pairState) => {
        if (current()) state.set({ pairState });
      };
      pairing.onMessage = (message) => {
        if (!current()) return;
        if (message.type === 'bye') state.set({ pairState: 'closed' });
        if (message.type === 'status') {
          const { battery, charging, width, height } = message;
          state.set({ phone: { battery, charging, width, height } });
        }
      };
    },

    clearPairing,

    enter(mode) {
      state.set({ session: mode, mode });
      remember(mode);
    },

    leave() {
      clearPairing();
      state.set({ session: null, mode: 'solo' });
      remember(null);
    },
  };
}
