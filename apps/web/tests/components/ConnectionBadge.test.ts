import { fireEvent, render, screen } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';

import ConnectionBadge from '@/components/ConnectionBadge.vue';
import type { LinkHealth, LinkReadings } from '@/pairing/link.js';
import type { PairState, PairingConnection } from '@/pairing/session.js';
import { createAppRouter } from '@/router/index.js';
import { PATHS } from '@/router/paths.js';
import { useLobbyStore } from '@/store/stores.js';

function paired(health: LinkHealth, readings: LinkReadings = {}, state: PairState = 'connected') {
  const lobby = useLobbyStore();
  lobby.session = 'paired';
  lobby.pairState = state;
  lobby.pairing = { close: () => undefined } as unknown as PairingConnection;
  lobby.link = { health, readings };
}

function show() {
  const router = createAppRouter(createMemoryHistory());
  const view = render(ConnectionBadge, { global: { plugins: [router] } });
  return { ...view, router };
}

describe('the connection badge', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('is a signal icon in the link\'s colour, named in words, with the numbers behind its chevron', async () => {
    paired('good', { estimateKbps: 2500, rttMs: 6, fps: 30, photoMs: 180 });
    const { container } = show();
    const badge = screen.getByRole('button', { name: /connection to the phone: good/i });
    expect(badge.className).toContain('status-ok');
    expect(badge.textContent?.trim()).toBe('');
    expect(screen.queryByRole('button', { name: /pair the phone again/i })).toBeNull();
    await fireEvent.click(badge);
    expect(container.textContent).toMatch(/2500 kbit\/s · round trip 6 ms/);
  });

  it('turns amber when slow', () => {
    paired('slow');
    show();
    expect(screen.getByRole('button', { name: /slow/i }).className).toContain('status-warn');
  });

  it('offers to pair again when the connection is bad, as the lobby does', async () => {
    paired('bad', { photoMs: 4150 });
    const { router } = show();
    expect(screen.getByRole('button', { name: /connection to the phone: bad/i }).className).toContain('status-bad');
    await fireEvent.click(screen.getByRole('button', { name: /pair the phone again/i }));
    await router.isReady();
    expect(useLobbyStore().pairing).toBeNull();
    expect(router.currentRoute.value.path).toBe(PATHS.pairLaptop);
  });

  it('says the phone has dropped out when the pairing is gone', () => {
    paired('good', {}, 'closed');
    show();
    expect(screen.getByRole('button', { name: /phone has dropped out/i }).className).toContain('status-bad');
    expect(screen.getByRole('button', { name: /pair the phone again/i })).toBeDefined();
  });

  it('shows nothing on a single device', () => {
    useLobbyStore().session = 'solo';
    const { container } = show();
    expect(container.textContent).toBe('');
  });
});
