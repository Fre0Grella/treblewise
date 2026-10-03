import { act, render, screen, within } from '@testing-library/react';
import { hit } from '@treblewise/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMatchStore } from '../store/match.js';
import { Game } from './Game.js';

// No camera here: the game screen alone.
vi.mock('../vision/camera.js', () => ({ cameraSupported: () => false, THUMB_SIZE: 64 }));
vi.mock('../vision/useCamera.js', () => ({
  useCamera: () => ({
    videoRef: { current: null },
    ready: false,
    error: null,
    width: 0,
    height: 0,
    moving: false,
    settles: 0,
    motion: 0,
    change: 0,
    quality: null,
    photo: null,
    capture: async () => null,
    sampleThumbnail: () => null,
  }),
}));
vi.mock('../vision/detector.js', () => ({ loadManifest: async () => null, loadDetector: async () => null }));

const config = {
  startScore: 501,
  inRule: 'straight' as const,
  outRule: 'double' as const,
  legsPerSet: 1,
  setsToWin: 1,
  players: [
    { id: 'ann', name: 'Ann' },
    { id: 'bob', name: 'Bob' },
  ],
};

async function press(name: RegExp | string, container: HTMLElement = document.body) {
  const button = within(container).getByRole('button', { name });
  await act(async () => {
    button.click();
  });
}

describe('the game screen', () => {
  beforeEach(() => {
    useMatchStore.setState((state) => ({
      match: null,
      snapshot: null,
      screen: 'setup',
      settings: { ...state.settings, entryMode: 'keypad', soundsEnabled: false, callerEnabled: false },
    }));
    useMatchStore.getState().startMatch(config);
  });

  it('keeps the visit just thrown correctable, third dart included, until the next player throws', async () => {
    const store = useMatchStore.getState();
    store.throwDart(hit(20, 'treble'));
    store.throwDart(hit(20, 'treble'));
    store.throwDart(hit(5, 'single')); // meant to be a treble 20
    render(<Game />);

    const last = screen.getByText(/ann, just thrown/i).closest('.throw-strip') as HTMLElement;
    await press('S5', last);
    await press(/treble/i);
    await press('20');

    const ann = useMatchStore.getState().snapshot!.legs[0]!.remaining.ann;
    expect(ann).toBe(501 - 180);
    expect(useMatchStore.getState().snapshot!.current!.playerId).toBe('bob');

    // Bob throws: Ann's visit is no longer offered.
    await press('19');
    expect(screen.queryByText(/ann, just thrown/i)).toBeNull();
  });
});

describe('the game screen with the autoscorer scoring', () => {
  beforeEach(() => {
    useMatchStore.setState((state) => ({
      match: null,
      snapshot: null,
      screen: 'setup',
      settings: {
        ...state.settings,
        entryMode: 'keypad',
        soundsEnabled: false,
        callerEnabled: false,
        keepFrames: true,
        autoscoreGames: true,
      },
    }));
    useMatchStore.getState().startMatch(config);
  });

  it('stays on the player who threw until the darts are out', async () => {
    const store = useMatchStore.getState();
    store.throwDart(hit(20, 'treble'), { source: 'auto' });
    store.throwDart(hit(20, 'treble'), { source: 'auto' });
    store.throwDart(hit(5, 'single'), { source: 'auto' });
    const { container } = render(<Game />);

    // The score has moved on to Bob; the screen has not.
    expect(useMatchStore.getState().snapshot!.current!.playerId).toBe('bob');
    expect(screen.getByText(/ann: pull the darts out/i)).toBeDefined();
    expect(container.querySelector('.player-current .player-name')!.textContent).toBe('Ann');
    expect([...container.querySelectorAll('.throw-who')].some((who) => /bob/i.test(who.textContent ?? ''))).toBe(false);

    // Ann's third dart can still be put right.
    const held = screen.getByText(/ann: pull the darts out/i).closest('.throw-strip') as HTMLElement;
    await press('S5', held);
    await press(/treble/i);
    await press('20');
    expect(useMatchStore.getState().snapshot!.legs[0]!.remaining.ann).toBe(501 - 180);

    await press(/darts out: bob to throw/i);
    expect(screen.queryByText(/pull the darts out/i)).toBeNull();
    expect(container.querySelector('.player-current .player-name')!.textContent).toBe('Bob');
  });
});

describe('camera setup from a match', () => {
  it('comes back to the match, not the lobby', () => {
    useMatchStore.setState({ screen: 'game', session: 'solo' });
    useMatchStore.getState().openCameraSetup();
    expect(useMatchStore.getState().screen).toBe('capture');
    expect(useMatchStore.getState().cameraReturn).toBe('game');

    // Anywhere else forgets it.
    useMatchStore.getState().setScreen('lobby');
    expect(useMatchStore.getState().cameraReturn).toBeNull();
  });
});
