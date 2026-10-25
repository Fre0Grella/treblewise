/**
 * New versions of the installed app (issue #13).
 *
 * The service worker downloads a new deploy in the background and then waits:
 * taking over would reload the page, and the page may be a match in progress.
 * So the player is told a new version is ready and chooses when (UpdatePrompt).
 * The match is in IndexedDB and resumes after the reload.
 *
 * A browser looks for a new service worker when a page is opened, but an
 * installed app can stay open on one page for days: it is asked again every
 * hour, and whenever the app comes back to the screen.
 */

import { ref } from 'vue';

const CHECK_EVERY_MS = 60 * 60 * 1000;

/** A new version is downloaded and waiting for the player to say so. */
export const updateReady = ref(false);

let apply: ((reload?: boolean) => Promise<void>) | null = null;

/** Registers the service worker. In the built app only: development has none. */
export async function startUpdates(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  apply = registerSW({
    onNeedRefresh: () => {
      updateReady.value = true;
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => undefined);
      };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}

/** Moves to the waiting version: the page reloads into it. */
export function applyUpdate(): void {
  void apply?.(true);
}
