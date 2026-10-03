import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { PairingConnection } from '../pairing/session.js';
import { useMatchStore } from '../store/match.js';
import { PhoneBattery } from './PhoneBattery.js';

const connected = {
  session: 'paired' as const,
  pairState: 'connected' as const,
  pairing: {} as PairingConnection,
};

describe('the phone battery', () => {
  beforeEach(() => {
    useMatchStore.setState({ session: null, pairState: null, pairing: null, phone: null });
  });

  it('shows the paired phone’s battery and whether it is charging', () => {
    useMatchStore.setState({ ...connected, phone: { battery: 64, charging: true } });
    render(<PhoneBattery />);
    expect(screen.getByText(/battery 64%, charging/i)).toBeDefined();
  });

  it('warns when the phone is low and not charging', () => {
    useMatchStore.setState({ ...connected, phone: { battery: 12, charging: false } });
    render(<PhoneBattery />);
    expect(screen.getByRole('status').textContent).toMatch(/12% and not charging/i);
  });

  it('says nothing low while it charges', () => {
    useMatchStore.setState({ ...connected, phone: { battery: 12, charging: true } });
    render(<PhoneBattery />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText(/battery 12%, charging/i)).toBeDefined();
  });

  it('shows nothing on a single device', () => {
    useMatchStore.setState({ session: 'solo', phone: { battery: 12, charging: false } });
    const { container } = render(<PhoneBattery />);
    expect(container.textContent).toBe('');
  });
});
