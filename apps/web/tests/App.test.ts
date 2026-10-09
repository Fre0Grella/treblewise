import { fireEvent, screen } from '@testing-library/vue';
import { hit } from '@treblewise/core';
import { describe, expect, it, vi } from 'vitest';

import { useLobbyStore, useMatchesStore, usePlayersStore, useSettingsStore } from '@/store/stores.js';
import { renderAt } from './support/renderAt.js';

// No camera in this walk through the app.
vi.mock('@/vision/camera.js', () => ({ cameraSupported: () => false, THUMB_SIZE: 64 }));

async function press(name: RegExp) {
  await fireEvent.click(await screen.findByRole('button', { name }));
  // Creating a profile writes it before the form closes: let that land.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('the app', () => {
  it('goes landing → start → lobby → setup → game, and scores', async () => {
    const { router } = await renderAt('/', () => {
      const settings = useSettingsStore();
      settings.settings = { ...settings.settings, callerEnabled: false, soundsEnabled: false, entryMode: 'keypad' };
    });
    const at = (path: string) => vi.waitFor(() => expect(router.currentRoute.value.path).toBe(path));

    // It opens by explaining what it is, not by dropping you into a leg.
    await press(/play darts/i);
    await at('/start');

    // Both modes are offered, with a picture each.
    expect(screen.getByLabelText(/one phone, watching the board/i)).toBeDefined();
    expect(screen.getByLabelText(/phone as the camera/i)).toBeDefined();

    await press(/use one device/i);
    await at('/lobby');
    expect(useLobbyStore().session).toBe('solo');

    await press(/new game/i);
    await at('/setup');

    // A profile, which keeps its statistics…
    await press(/new profile/i);
    await fireEvent.update(screen.getByLabelText(/new profile/i), 'Marco');
    await press(/^create$/i);

    // …and a guest, who does not.
    await press(/\+ guest/i);
    await press(/add for this match/i);

    expect(screen.getByText(/marco/i)).toBeDefined();
    expect(usePlayersStore().profiles.map((profile) => profile.id)).toEqual(['marco']);

    await press(/start match/i);
    await at('/game');
    expect(await screen.findAllByText('501')).toHaveLength(2);

    const matches = useMatchesStore();
    matches.throwDart(hit(20, 'treble'), { pos: { x: 0, y: 103 } });
    matches.throwDart(hit(20, 'treble'));
    matches.throwDart(hit(20, 'treble'));

    expect(await screen.findByText('321')).toBeDefined();
    // The throw passes to the guest, who is named on the scoreboard like anyone.
    expect(screen.getByText(/guest to throw/i)).toBeDefined();

    // And every screen comes back to the lobby during a session.
    await router.push('/stats');
    await press(/back/i);
    await at('/lobby');
  });

  it('reloads into the screen its address names', async () => {
    const { router } = await renderAt('/stats');
    expect(router.currentRoute.value.path).toBe('/stats');
    expect(await screen.findByRole('heading', { name: /statistics/i })).toBeDefined();
  });
});
