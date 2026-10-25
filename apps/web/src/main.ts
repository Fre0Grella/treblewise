import { createPinia } from 'pinia';
import { createApp } from 'vue';

import App from './App.vue';
import { setLocale } from './i18n/index.js';
import { listenForInstall } from './pwa/install.js';
import { startUpdates } from './pwa/update.js';
import { createAppRouter, redirectOldHash } from './router/index.js';
import { loadStores, useLobbyStore, useMatchesStore, useSettingsStore } from './store/stores.js';
// The display face, served with the app so it works offline and asks no
// third party for anything (issue #20). Latin only, the two weights in use.
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './styles/global.css';

redirectOldHash();
// Before anything awaits: the browser's offer to install comes once, early.
listenForInstall();

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

// Settings, matches, profiles and the tab's session first: the first screen
// shows what is stored, not a flash of an empty app.
await loadStores();
setLocale(useSettingsStore().settings.locale);

app.use(createAppRouter());

if (import.meta.env.DEV) {
  // Pairing is the one feature that cannot be exercised from a unit test: it
  // needs two real peer connections and a camera. Exposing it on the dev build
  // lets an automated browser run the whole handshake end to end. Not shipped.
  void Promise.all([import('./pairing/session.js'), import('./pairing/payload.js'), import('@treblewise/core')]).then(
    ([session, payload, core]) => {
      const dev = window as unknown as { __treblewise?: unknown };
      dev.__treblewise = {
        PairingConnection: session.PairingConnection,
        compactSdp: payload.compactSdp,
        core,
        stores: { lobby: useLobbyStore(), matches: useMatchesStore(), settings: useSettingsStore() },
      };
    },
  );
}

app.mount('#root');

// The service worker exists in the built app only (vite.config.ts).
if (import.meta.env.PROD) void startUpdates();
