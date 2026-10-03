import { act, render, screen, within } from '@testing-library/react';
import { hit } from '@treblewise/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMatchStore } from '../store/match.js';
import { Game } from './Game.js';

// No camera here: the game screen alone.
vi.mock('../vision/camera.js', () => ({ cameraSupported: () => false, THUMB_SIZE: 64 }));

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
