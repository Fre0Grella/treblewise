import { fireEvent, render, screen } from '@testing-library/vue';
import { afterEach, describe, expect, it } from 'vitest';

import FullscreenButton from '@/components/ui/FullscreenButton.vue';
import { fakeFullscreen } from '../../support/fullscreen.js';

describe('the fullscreen button', () => {
  let restore: () => void = () => {};
  afterEach(() => restore());

  it('is not there where the page cannot go fullscreen', () => {
    render(FullscreenButton);
    expect(screen.queryByRole('button', { name: /fullscreen/i })).toBeNull();
  });

  it('is an icon with a label, and turns fullscreen on and off', async () => {
    const browser = fakeFullscreen();
    restore = browser.restore;
    render(FullscreenButton);

    const button = screen.getByRole('button', { name: 'Fullscreen' });
    expect(button.textContent?.trim()).toBe('');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(button.getAttribute('aria-pressed')).toBe('false');

    await fireEvent.click(button);
    expect(browser.request).toHaveBeenCalledOnce();
    const leave = await screen.findByRole('button', { name: 'Leave fullscreen' });
    expect(leave.getAttribute('aria-pressed')).toBe('true');

    await fireEvent.click(leave);
    expect(browser.exit).toHaveBeenCalledOnce();
    await screen.findByRole('button', { name: 'Fullscreen' });
  });

  it('follows the browser when Esc leaves fullscreen', async () => {
    const browser = fakeFullscreen();
    restore = browser.restore;
    render(FullscreenButton);

    await fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    await screen.findByRole('button', { name: 'Leave fullscreen' });
    browser.leaveByBrowser();
    await screen.findByRole('button', { name: 'Fullscreen' });
    expect(browser.exit).not.toHaveBeenCalled();
  });

  it('shrugs off a browser that refuses', async () => {
    const browser = fakeFullscreen();
    restore = browser.restore;
    browser.request.mockRejectedValueOnce(new TypeError('not allowed'));
    render(FullscreenButton);

    await fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeDefined();
  });
});
