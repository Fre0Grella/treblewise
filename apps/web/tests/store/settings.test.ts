import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, loadSettings } from '@/storage/db.js';
import type { Slice } from '@/store/slice.js';
import { createSettings, type SettingsState } from '@/store/settings.js';

function held(initial: SettingsState): Slice<SettingsState> {
  let state = initial;
  return { get: () => state, set: (patch) => (state = { ...state, ...patch }) };
}

describe('the settings', () => {
  it('changes one setting in memory and on disk together', async () => {
    const state = held({ settings: DEFAULT_SETTINGS });
    createSettings(state).change('entryMode', 'keypad');

    expect(state.get().settings).toEqual({ ...DEFAULT_SETTINGS, entryMode: 'keypad' });
    expect((await loadSettings()).entryMode).toBe('keypad');
  });

  it('replaces the settings rather than editing them, so the change is seen', () => {
    const state = held({ settings: DEFAULT_SETTINGS });
    createSettings(state).change('callerEnabled', false);

    expect(state.get().settings).not.toBe(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.callerEnabled).toBe(true);
  });

  it('keeps a change made to the state in between, as every change reads it afresh', () => {
    const state = held({ settings: DEFAULT_SETTINGS });
    const settings = createSettings(state);
    state.set({ settings: { ...state.get().settings, keepFrames: true } });
    settings.change('autoscoreGames', true);

    expect(state.get().settings.keepFrames).toBe(true);
    expect(state.get().settings.autoscoreGames).toBe(true);
  });
});
