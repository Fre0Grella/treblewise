import { render, screen } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import type { PairingConnection } from '@/pairing/session.js';
import { useLobbyStore, type PhoneStatus } from '@/store/stores.js';
import PhoneBattery from '@/components/PhoneBattery.vue';

/** A paired phone that last said this about itself. */
function paired(phone: PhoneStatus) {
  const lobby = useLobbyStore();
  lobby.session = 'paired';
  lobby.pairState = 'connected';
  lobby.pairing = {} as PairingConnection;
  lobby.phone = phone;
}

const show = () => render(PhoneBattery, { global: { plugins: [] } });

describe('the phone battery', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows the paired phone’s battery and whether it is charging', () => {
    paired({ battery: 64, charging: true });
    show();
    expect(screen.getByText(/battery 64%, charging/i)).toBeDefined();
  });

  it('warns when the phone is low and not charging', () => {
    paired({ battery: 12, charging: false });
    show();
    expect(screen.getByRole('status').textContent).toMatch(/12% and not charging/i);
  });

  it('says nothing low while it charges', () => {
    paired({ battery: 12, charging: true });
    show();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText(/battery 12%, charging/i)).toBeDefined();
  });

  it('leaves out "100%, charging": some browsers say it whatever the battery does', () => {
    paired({ battery: 100, charging: true });
    const { container } = show();
    expect(container.textContent).toBe('');
  });

  it('still shows a full phone that is not charging', () => {
    paired({ battery: 100, charging: false });
    show();
    expect(screen.getByText(/battery 100%/i)).toBeDefined();
  });

  it('shows nothing on a single device', () => {
    const lobby = useLobbyStore();
    lobby.session = 'solo';
    lobby.phone = { battery: 12, charging: false };
    const { container } = show();
    expect(container.textContent).toBe('');
  });
});
