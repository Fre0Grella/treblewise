/**
 * The settings: the preferences that are remembered, and the calibration.
 *
 * Every one of them is changed the same way, in memory and on disk together,
 * so there is one way to change them rather than one action per setting each
 * repeating the other two lines. What a change means beyond that (the caller
 * falling silent when it is switched off) belongs to whoever listens for it.
 */

import { saveSetting, type Settings } from '../storage/db.js';

import type { Slice } from './slice.js';

export interface SettingsState {
  settings: Settings;
}

export interface SettingsActions {
  /** Changes one setting and saves it. */
  change<K extends keyof Settings>(key: K, value: Settings[K]): void;
}

export function createSettings(state: Slice<SettingsState>): SettingsActions {
  return {
    change(key, value) {
      state.set({ settings: { ...state.get().settings, [key]: value } });
      void saveSetting(key, value);
    },
  };
}
