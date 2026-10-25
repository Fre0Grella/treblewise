import { describe, expect, it, vi } from 'vitest';

import { canInstall, install, installed, listenForInstall, onIos } from '@/pwa/install.js';

/** The browser's offer to install, answered `outcome`. */
function offer(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn(async () => undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe('installing the app', () => {
  listenForInstall();

  it("keeps the browser's offer for the app's own button, and opens it once", async () => {
    const event = offer('dismissed');
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(canInstall.value).toBe(true);

    expect(await install()).toBe(false);
    expect(event.prompt).toHaveBeenCalledOnce();
    // Used up, whatever the answer.
    expect(canInstall.value).toBe(false);
    expect(await install()).toBe(false);
  });

  it('knows once it is installed, from the dialog or from the browser', async () => {
    window.dispatchEvent(offer('accepted'));
    expect(await install()).toBe(true);
    expect(installed.value).toBe(true);

    installed.value = false;
    window.dispatchEvent(new Event('appinstalled'));
    expect(installed.value).toBe(true);
  });
});

describe('onIos', () => {
  it('knows an iPhone, and an iPad that says it is a Mac', () => {
    expect(onIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari', 5)).toBe(true);
    expect(onIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5)).toBe(true);
  });

  it('is not fooled by a Mac or an Android phone', () => {
    expect(onIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 0)).toBe(false);
    expect(onIos('Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome', 5)).toBe(false);
  });
});
