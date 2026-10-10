import { fireEvent, screen, within } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';

import { useLobbyStore, useMatchesStore } from '@/store/stores.js';
import { renderAt } from '../support/renderAt.js';

describe('the landing page', () => {
  it('puts the board behind the page as decoration, not as something to use', async () => {
    const { container } = await renderAt('/');
    const backdrop = container.querySelector('.landing-backdrop')!;
    expect(backdrop.getAttribute('aria-hidden')).toBe('true');

    const board = backdrop.querySelector('svg')!;
    expect(board.getAttribute('aria-hidden')).toBe('true');
    // Not the board you score on: no button role, no label to announce.
    expect(board.getAttribute('role')).toBeNull();
    expect(screen.queryByRole('button', { name: /dartboard/i })).toBeNull();
    expect(screen.queryByRole('img', { name: /dartboard/i })).toBeNull();
    // It turns, so it carries no numbers: they would go round upside down.
    expect(board.querySelectorAll('text')).toHaveLength(0);
  });

  it('gives the action that starts play the board button, and goes to the start', async () => {
    const { router } = await renderAt('/');
    const play = screen.getByRole('button', { name: /play darts/i });
    expect(play.className).toContain('board-btn');
    expect(screen.getByRole('button', { name: /statistics/i }).className).not.toContain('board-btn');
    await fireEvent.click(play);
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/start'));
  });

  it('offers no way back into a match: the device setup comes first', async () => {
    await renderAt('/', () => {
      useMatchesStore().match = {
        id: 'm',
        config: {
          startScore: 501,
          inRule: 'straight',
          outRule: 'double',
          legsPerSet: 1,
          setsToWin: 1,
          players: [{ id: 'ann', name: 'Ann' }],
        },
        events: [{ type: 'dart.thrown', id: 'd', ts: 1, hit: { sector: 20, ring: 'treble', value: 60 }, source: 'manual' }],
        createdAt: 1,
        updatedAt: 1,
        finished: false,
      };
    });
    expect(screen.queryByRole('button', { name: /carry on|resume/i })).toBeNull();
    expect(screen.getByRole('button', { name: /play darts/i }).className).toContain('board-btn');
  });

  it('moves the board button to the lobby when there is a session', async () => {
    await renderAt('/', () => useLobbyStore().enter('solo'));
    expect(screen.getByRole('button', { name: /back to the lobby/i }).className).toContain('board-btn');
    expect(screen.getByRole('button', { name: /play darts/i }).className).not.toContain('board-btn');
  });

  it('ends with the footer: the source one click away, and the donation link', async () => {
    await renderAt('/');
    const footer = screen.getByRole('contentinfo');
    const source = within(footer).getByRole('link', { name: /source code/i });
    expect(source.getAttribute('href')).toBe('https://github.com/Fre0Grella/treblewise');
    expect(within(footer).getByRole('link', { name: /donate/i }).getAttribute('href')).toBe('https://ko-fi.com/freogrella');
    expect(footer.textContent).toContain(`© ${new Date().getFullYear()} treblewise`);
    // The voice's credit stays on the page (docs/08).
    expect(screen.getByText(/chatterbox by resemble ai/i)).toBeDefined();
  });
});

describe('the start', () => {
  it('goes straight into the lobby with one device, and to the pairing with two', async () => {
    const { router } = await renderAt('/start');
    expect(screen.getByLabelText(/one phone, watching the board/i)).toBeDefined();
    expect(screen.getByLabelText(/phone as the camera/i)).toBeDefined();

    await fireEvent.click(screen.getByRole('button', { name: /use one device/i }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/lobby'));
    expect(useLobbyStore().session).toBe('solo');

    await router.push('/start');
    await fireEvent.click(await screen.findByRole('button', { name: /pair two devices/i }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/pair'));
    expect(useLobbyStore().mode).toBe('paired');
  });

  it('has Back at the top, leading home', async () => {
    const { router } = await renderAt('/start');
    const back = screen.getByRole('button', { name: /back/i });
    expect(back.closest('header')).not.toBeNull();
    await fireEvent.click(back);
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/'));
  });
});
