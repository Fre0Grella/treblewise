import { render, screen } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import PhoneLink from '@/components/PhoneLink.vue';
import type { LinkHealth, LinkReadings } from '@/pairing/link.js';
import type { PairingConnection } from '@/pairing/session.js';
import { useLobbyStore } from '@/store/stores.js';

function paired(health: LinkHealth, readings: LinkReadings) {
  const lobby = useLobbyStore();
  lobby.session = 'paired';
  lobby.pairState = 'connected';
  lobby.pairing = {} as PairingConnection;
  lobby.link = { health, readings };
}

describe('the connection light', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('says the connection is good, with the numbers folded under it', () => {
    paired('good', { estimateKbps: 2500, rttMs: 6, fps: 30, photoMs: 180 });
    const { container } = render(PhoneLink);
    expect(screen.getByText(/connection to the phone: good/i)).toBeDefined();
    expect(container.querySelector('details')?.open).toBe(false);
    expect(container.textContent).toMatch(/2500 kbit\/s · round trip 6 ms · 30 frames\/s · photos take 180 ms/);
  });

  it('says what to do when the connection is bad', () => {
    paired('bad', { photoMs: 4150 });
    render(PhoneLink);
    expect(screen.getByRole('status').textContent).toMatch(/pair again/i);
    expect(screen.getByText(/photos take 4150 ms/)).toBeDefined();
  });

  it('shows nothing on a single device', () => {
    const lobby = useLobbyStore();
    lobby.session = 'solo';
    lobby.link = { health: 'bad', readings: {} };
    const { container } = render(PhoneLink);
    expect(container.textContent).toBe('');
  });
});
