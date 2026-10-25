/**
 * The camera's brightness, for whichever camera is filming: the one this tab
 * opened (useCamera sets it), or in paired mode the phone's, which is asked to
 * set it over the control channel and says where it ended up.
 *
 * The setting lives on this side, so a phone that reconnects, or a different
 * phone, is told again.
 */

import { computed, watch } from 'vue';

import { useLobbyStore, useSettingsStore } from '../store/stores.js';
import { clampExposure, type Exposure } from '../vision/exposure.js';
import type { Camera } from './useCamera.js';

export function useExposure(camera: Pick<Camera, 'exposure'>) {
  const settings = useSettingsStore();
  const lobby = useLobbyStore();

  const paired = computed(() => lobby.mode === 'paired' && lobby.pairing !== null);
  /** What the filming camera allows and is at; null where a page cannot set it. */
  const range = computed<Exposure | null>(() => (paired.value ? (lobby.phone?.exposure ?? null) : camera.exposure.value));

  // Told once per connection and per change: a phone that cannot get there
  // reports somewhere else, and asking again would never end.
  let told: { pairing: unknown; value: number } | null = null;
  watch(
    () => [lobby.pairing, lobby.phone?.exposure, settings.settings.exposure] as const,
    ([pairing, phone, wanted]) => {
      if (!paired.value || !pairing || !phone || wanted === null) return;
      const value = clampExposure(wanted, phone);
      if (told?.pairing === pairing && told.value === value) return;
      told = { pairing, value };
      if (phone.value !== value) pairing.send({ type: 'exposure', value });
    },
    { immediate: true },
  );

  return {
    range,
    /** Where the control sits: the setting, or the camera's own while there is none. */
    value: computed(() => settings.settings.exposure ?? range.value?.value ?? 0),
    set: (value: number) => settings.setExposure(value),
  };
}
