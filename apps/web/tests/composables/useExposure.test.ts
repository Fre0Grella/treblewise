import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, shallowRef } from 'vue';

import { useExposure } from '@/composables/useExposure.js';
import type { PairingConnection } from '@/pairing/session.js';
import { useLobbyStore, useSettingsStore } from '@/store/stores.js';
import type { Exposure } from '@/vision/exposure.js';

const phoneExposure = (value: number): Exposure => ({ min: -2, max: 2, step: 0.5, value });

function pairedPhone() {
  const send = vi.fn();
  const lobby = useLobbyStore();
  lobby.mode = 'paired';
  lobby.pairing = { send } as unknown as PairingConnection;
  return { send, lobby };
}

/** Replaced, not changed in place: the store starts out holding the shared defaults. */
function wantBrightness(exposure: number) {
  const settings = useSettingsStore();
  settings.settings = { ...settings.settings, exposure };
}

describe('useExposure', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("offers the laptop's own camera range when not paired", () => {
    const exposure = useExposure({ exposure: shallowRef<Exposure | null>(phoneExposure(0)) });
    expect(exposure.range.value).toEqual(phoneExposure(0));
    expect(exposure.value.value).toBe(0);
  });

  it('tells a paired phone the brightness once it says what its camera allows', async () => {
    const { send, lobby } = pairedPhone();
    wantBrightness(-1);
    const exposure = useExposure({ exposure: shallowRef(null) });
    expect(send).not.toHaveBeenCalled();

    lobby.phone = { exposure: phoneExposure(0) };
    await nextTick();
    expect(send).toHaveBeenCalledWith({ type: 'exposure', value: -1 });
    expect(exposure.range.value).toEqual(phoneExposure(0));
  });

  it('does not keep asking a phone that cannot get there', async () => {
    const { send, lobby } = pairedPhone();
    wantBrightness(-1);
    useExposure({ exposure: shallowRef(null) });
    lobby.phone = { exposure: phoneExposure(0) };
    await nextTick();
    lobby.phone = { exposure: phoneExposure(0), battery: 80 };
    await nextTick();
    expect(send).toHaveBeenCalledOnce();
  });

  it('asks again when the brightness changes, and says nothing with no setting', async () => {
    const { send, lobby } = pairedPhone();
    const exposure = useExposure({ exposure: shallowRef(null) });
    lobby.phone = { exposure: phoneExposure(0) };
    await nextTick();
    expect(send).not.toHaveBeenCalled();

    exposure.set(-1.5);
    await nextTick();
    expect(send).toHaveBeenCalledWith({ type: 'exposure', value: -1.5 });
  });
});
