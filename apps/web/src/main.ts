import { createPinia } from 'pinia';
import { createApp } from 'vue';

import App from './App.vue';
import { setLocale } from './i18n/index.js';
import { createAppRouter, redirectOldHash } from './router/index.js';
import { loadStores, useLobbyStore, useMatchesStore, useSettingsStore } from './store/stores.js';
import './styles/global.css';

redirectOldHash();

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
