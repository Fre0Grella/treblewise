/**
 * A browser that can go fullscreen, for a test: jsdom has no Fullscreen API,
 * so without this the fullscreen button is never there. Returns the stubs and
 * a way to put the document back as it was.
 */

import { vi } from 'vitest';

export function fakeFullscreen() {
  let element: Element | null = null;
  const change = (to: Element | null) => {
    element = to;
    document.dispatchEvent(new Event('fullscreenchange'));
  };
  const request = vi.fn(async () => change(document.documentElement));
  const exit = vi.fn(async () => change(null));

  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request });

  const restore = () => {
    for (const key of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen'] as const) {
      Reflect.deleteProperty(document, key);
    }
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  };
  /** Esc, or the browser itself, leaving fullscreen. */
  const leaveByBrowser = () => change(null);
  return { request, exit, restore, leaveByBrowser };
}
