/**
 * Installing the app (issue #13): when the browser offers it, and how to on
 * an iPhone, which never does.
 *
 * Chrome and Edge fire `beforeinstallprompt` once, early, and only that event
 * can open their install dialog. It is caught here, as the app starts (main.ts
 * imports this before anything awaits), and kept for the "Install app" button.
 * Safari on iOS has no such event: there it is Share, then Add to Home Screen,
 * and the app can only say so.
 */

import { ref } from 'vue';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let offered: BeforeInstallPromptEvent | null = null;

/** The browser has offered to install the app, and the offer is still open. */
export const canInstall = ref(false);
/** Running as the installed app, or installed from this tab just now. */
export const installed = ref(false);

/** Whether this window is the installed app: its own window, with no browser around it. */
export function runningStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
}

/**
 * An iPhone or an iPad, where installing is Add to Home Screen. An iPad
 * says it is a Mac; a Mac has no touch screen.
 */
export function onIos(userAgent = navigator.userAgent, touchPoints = navigator.maxTouchPoints ?? 0): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);
}

export function listenForInstall(): void {
  installed.value = runningStandalone();
  window.addEventListener('beforeinstallprompt', (event) => {
    // Kept for the app's own button, instead of the browser's banner.
    event.preventDefault();
    offered = event as BeforeInstallPromptEvent;
    canInstall.value = true;
  });
  window.addEventListener('appinstalled', () => {
    offered = null;
    canInstall.value = false;
    installed.value = true;
  });
}

/** Opens the browser's install dialog; true if the app was installed. */
export async function install(): Promise<boolean> {
  const event = offered;
  if (!event) return false;
  // The event can be used once, whatever the answer.
  offered = null;
  canInstall.value = false;
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') installed.value = true;
  return outcome === 'accepted';
}
