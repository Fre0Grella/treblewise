import { fireEvent, screen, within } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';
import { createWebHistory } from 'vue-router';

import { renderAt } from '../support/renderAt.js';

describe('the privacy page', () => {
  it('says what is stored, where, and how to delete it, with a way to ask', async () => {
    await renderAt('/privacy');
    for (const heading of [/what is stored/i, /^where$/i, /pairing/i, /the caller/i, /deleting it/i, /contributions/i]) {
      expect(screen.getByRole('heading', { name: heading })).toBeDefined();
    }
    expect(screen.getByText(/nothing is sent to the developer/i)).toBeDefined();
    expect(screen.getByRole('link', { name: /freogrella on github/i }).getAttribute('href')).toBe('https://github.com/Fre0Grella');
  });

  it('is reached from the footer only, and Back returns to the page it was opened from', async () => {
    const { router } = await renderAt('/', undefined, { history: createWebHistory() });
    // The landing page links to it from its footer, nowhere else.
    for (const link of screen.getAllByRole('link', { name: /^(privacy|terms)$/i })) {
      expect(link.closest('footer')).not.toBeNull();
    }

    await router.push('/stats');
    await fireEvent.click(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Privacy' }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/privacy'));

    await fireEvent.click(await screen.findByRole('button', { name: /back/i }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/stats'));
  });

  it('goes home on Back when it was opened directly', async () => {
    const { router } = await renderAt('/privacy');
    await fireEvent.click(screen.getByRole('button', { name: /back/i }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/'));
  });
});
