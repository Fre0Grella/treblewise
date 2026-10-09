import { fireEvent, screen } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import type { ControlMessage, PairState, PairingConnection } from '@/pairing/session.js';
import { useLobbyStore, useMatchesStore } from '@/store/stores.js';
import { renderAt } from '../support/renderAt.js';

/** Enough of a connection for the store: its state, its callbacks, and close(). */
function fakePhone() {
  return {
    state: 'connected' as PairState,
    onState: null as ((state: PairState) => void) | null,
    onMessage: null as ((message: ControlMessage) => void) | null,
    close: vi.fn(),
  };
}

function pairWith(phone: ReturnType<typeof fakePhone>) {
  const lobby = useLobbyStore();
  lobby.setPairing(phone as unknown as PairingConnection, {} as MediaStream);
  lobby.enter('paired');
}

describe('the lobby', () => {
  it('keeps the pairing when you go to camera setup and come back', async () => {
    const phone = fakePhone();
    const { router } = await renderAt('/lobby', () => pairWith(phone));

    // Camera setup and Back: the path that used to drop you on the landing page.
    await router.push('/stats');
    await fireEvent.click(await screen.findByRole('button', { name: /back/i }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/lobby'));
    expect(useLobbyStore().pairing).toBe(phone);
    expect(phone.close).not.toHaveBeenCalled();
  });

  it("shows the phone's battery and resolution", async () => {
    const phone = fakePhone();
    await renderAt('/lobby', () => pairWith(phone));
    phone.onMessage?.({ type: 'status', battery: 64, charging: true, width: 1920, height: 1080 });
    await nextTick();
    expect(screen.getByText(/battery 64%, charging · 1920×1080/i)).toBeDefined();
  });

  it('asks before leaving with the phone paired, and only then ends the pairing', async () => {
    const phone = fakePhone();
    const { router } = await renderAt('/lobby', () => pairWith(phone));

    await fireEvent.click(screen.getByRole('button', { name: /leave the lobby/i }));
    expect(screen.getByRole('alertdialog')).toBeDefined();
    expect(phone.close).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole('button', { name: /stay in the lobby/i }));
    expect(phone.close).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole('button', { name: /leave the lobby/i }));
    await fireEvent.click(screen.getByRole('button', { name: /leave and end the pairing/i }));
    expect(phone.close).toHaveBeenCalledOnce();
    expect(useLobbyStore().session).toBeNull();
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/'));
  });

  it('leaves a solo lobby without asking', async () => {
    const { router } = await renderAt('/lobby', () => useLobbyStore().enter('solo'));
    await fireEvent.click(screen.getByRole('button', { name: /leave the lobby/i }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/'));
  });

  it('says when the phone drops, and offers to pair again', async () => {
    const phone = fakePhone();
    const { router } = await renderAt('/lobby', () => pairWith(phone));

    phone.onState?.('failed');
    await nextTick();
    expect(screen.getByText(/the phone has disconnected/i)).toBeDefined();

    await fireEvent.click(screen.getByRole('button', { name: /pair the phone again/i }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/pair/laptop'));
    expect(useLobbyStore().pairing).toBeNull();
    // Still in the session: once the new pairing connects, it is the lobby again.
    expect(useLobbyStore().session).toBe('paired');
  });

  it('names the selected entry, and follows the pointer and the keyboard', async () => {
    const { container } = await renderAt('/lobby', () => useLobbyStore().enter('solo'));
    const title = () => container.querySelector('.lobby-title')!.textContent;
    const art = () => container.querySelector('.lobby-art-frame')!.className;

    // The first entry leads: with no match in progress, a new game.
    expect(title()).toBe('New game');
    expect(screen.getByRole('button', { name: /new game/i }).getAttribute('aria-current')).toBe('true');
    expect(art()).toContain('lobby-art-newGame');

    await fireEvent.pointerMove(screen.getByRole('button', { name: /statistics/i }));
    expect(title()).toBe('Statistics');
    expect(art()).toContain('lobby-art-stats');
    expect(screen.getByRole('button', { name: /statistics/i }).getAttribute('aria-describedby')).toBe('lobby-desc');

    // Arrow keys move the selection and the focus together, and wrap.
    const list = container.querySelector('.lobby-menu ul')!;
    await fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(title()).toBe('Leave the lobby');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /leave the lobby/i }));
    await fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(title()).toBe('New game');
    await fireEvent.keyDown(list, { key: 'End' });
    expect(title()).toBe('Leave the lobby');
  });

  it('leads with resuming when a match is in progress', async () => {
    const { container } = await renderAt('/lobby', () => {
      useLobbyStore().enter('solo');
      useMatchesStore().match = { id: 'm', createdAt: 0, updatedAt: 0, finished: false, events: [{} as never], config: {} as never };
    });
    expect(container.querySelector('.lobby-title')!.textContent).toBe('Resume the match');
  });

  it('asks for a mode first when there is no session behind the address', async () => {
    const { router } = await renderAt('/lobby');
    await fireEvent.click(screen.getByRole('button', { name: /choose how to play/i }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/start'));
  });
});
