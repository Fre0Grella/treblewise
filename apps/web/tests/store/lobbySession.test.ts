import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ControlMessage, PairState, PairingConnection } from '@/pairing/session.js';
import type { Slice } from '@/store/slice.js';
import { createLobbySession, recallLobbySession, type LobbySessionState } from '@/store/lobbySession.js';

function held(): Slice<LobbySessionState> {
  let state: LobbySessionState = {
    mode: 'solo',
    session: null,
    pairing: null,
    remoteStream: null,
    pairState: null,
    phone: null,
    link: null,
  };
  return { get: () => state, set: (patch) => (state = { ...state, ...patch }) };
}

/** Enough of a connection for the session: its state, its callbacks, and close(). */
function fakePhone() {
  return {
    state: 'connected' as PairState,
    onState: null as ((state: PairState) => void) | null,
    onMessage: null as ((message: ControlMessage) => void) | null,
    close: vi.fn(),
    linkStats: vi.fn(async () => ({})),
  };
}

const video = {} as MediaStream;

describe('the lobby session', () => {
  beforeEach(() => sessionStorage.clear());

  it('is remembered for the tab under the key it has always had', () => {
    const lobby = createLobbySession(held());
    lobby.enter('paired');
    expect(sessionStorage.getItem('oche.session')).toBe('paired');
    expect(recallLobbySession()).toEqual({ session: 'paired', mode: 'paired' });

    lobby.leave();
    expect(sessionStorage.getItem('oche.session')).toBeNull();
    expect(recallLobbySession()).toEqual({ session: null, mode: 'solo' });
  });

  it('recalls nothing it does not recognise', () => {
    sessionStorage.setItem('oche.session', 'trio');
    expect(recallLobbySession()).toEqual({ session: null, mode: 'solo' });
  });

  it('takes over a phone and follows how it is doing', () => {
    const state = held();
    const phone = fakePhone();
    createLobbySession(state).setPairing(phone as unknown as PairingConnection, video);

    expect(state.get()).toMatchObject({ pairing: phone, remoteStream: video, mode: 'paired', pairState: 'connected' });

    phone.onState!('connecting');
    expect(state.get().pairState).toBe('connecting');

    phone.onMessage!({ type: 'status', battery: 0.5, charging: true, width: 1280, height: 720 } as ControlMessage);
    expect(state.get().phone).toEqual({ battery: 0.5, charging: true, width: 1280, height: 720 });

    phone.onMessage!({ type: 'bye' } as ControlMessage);
    expect(state.get().pairState).toBe('closed');
  });

  it('ignores a phone it no longer holds', () => {
    const state = held();
    const lobby = createLobbySession(state);
    const old = fakePhone();
    lobby.setPairing(old as unknown as PairingConnection, video);
    const oldOnState = old.onState!;

    lobby.setPairing(fakePhone() as unknown as PairingConnection, video);
    oldOnState('failed');
    expect(state.get().pairState).toBe('connected');
  });

  it('closes the phone and lets go of it when switched to solo', () => {
    const state = held();
    const lobby = createLobbySession(state);
    const phone = fakePhone();
    lobby.setPairing(phone as unknown as PairingConnection, video);

    lobby.setMode('solo');
    expect(phone.close).toHaveBeenCalled();
    expect(phone.onState).toBeNull();
    expect(phone.onMessage).toBeNull();
    expect(state.get()).toMatchObject({ mode: 'solo', pairing: null, remoteStream: null, pairState: null, phone: null });
  });

  it('ends any pairing when the session ends', () => {
    const state = held();
    const lobby = createLobbySession(state);
    const phone = fakePhone();
    lobby.setPairing(phone as unknown as PairingConnection, video);
    lobby.enter('paired');

    lobby.leave();
    expect(phone.close).toHaveBeenCalled();
    expect(state.get()).toMatchObject({ session: null, mode: 'solo', pairing: null });
  });

  it('lights the connection from what the laptop and the phone see, steadily', async () => {
    vi.useFakeTimers();
    try {
      const state = held();
      const phone = fakePhone();
      phone.linkStats = vi.fn(async () => ({ rttMs: 5, fps: 30, photoMs: 150 }));
      const lobby = createLobbySession(state);
      lobby.setPairing(phone as unknown as PairingConnection, video);
      await vi.advanceTimersByTimeAsync(2000);
      expect(state.get().link).toEqual({ health: 'good', readings: { rttMs: 5, fps: 30, photoMs: 150 } });

      // Photographs crawling: red, but only once it is seen twice running.
      phone.linkStats = vi.fn(async () => ({ rttMs: 5, fps: 30, photoMs: 4100 }));
      await vi.advanceTimersByTimeAsync(2000);
      expect(state.get().link?.health).toBe('good');
      await vi.advanceTimersByTimeAsync(2000);
      expect(state.get().link?.health).toBe('bad');

      lobby.clearPairing();
      expect(state.get().link).toBeNull();
      await vi.advanceTimersByTimeAsync(4000);
      expect(state.get().link).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not hold the phone’s estimate against it while it is still climbing', async () => {
    vi.useFakeTimers();
    try {
      const state = held();
      const phone = fakePhone();
      createLobbySession(state).setPairing(phone as unknown as PairingConnection, video);
      phone.onMessage!({ type: 'status', sending: { width: 720, height: 1280, limitation: 'none', estimateKbps: 300 } });
      await vi.advanceTimersByTimeAsync(4000);
      expect(state.get().link).toBeNull();
      await vi.advanceTimersByTimeAsync(14_000);
      expect(state.get().link?.health).toBe('bad');
    } finally {
      vi.useRealTimers();
    }
  });
});

