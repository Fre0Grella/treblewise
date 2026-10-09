<!--
  The lobby: where you are between everything else once a way of playing is
  chosen.

  Before it existed every screen had its own idea of "back", and going back
  from the camera setup after pairing dropped you on the landing page with the
  phone still connected and no way to reach it. Choosing two devices again
  paired a second time. Now choosing a mode (and, for two devices, connecting
  the phone) opens the lobby, every screen comes back here, and the pairing
  only ends when you leave the lobby and say so.

  Laid out like a console game's lobby (issue #7): the menu in the bottom left,
  the entry you are on named large in the top left with a line on what it
  does, and its picture filling the right. On a phone the menu takes the whole
  screen and the picture sits behind it, faint. One entry is always the
  selected one (by pointer, focus or the arrow keys), and the menu is a list of
  real buttons, so a screen reader and a keyboard get the same menu.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import LobbyArt, { type LobbyArtKind } from '../components/art/LobbyArt.vue';
import { shownBattery } from '../components/batteryLevel.js';
import ScreenShell from '../components/ui/ScreenShell.vue';
import { fill, useStrings } from '../i18n/index.js';
import { PATHS } from '../router/paths.js';
import { useLobbyStore, useMatchesStore, useSettingsStore } from '../store/stores.js';

interface Entry {
  id: LobbyArtKind;
  label: string;
  description: string;
  run: () => void;
}

const t = useStrings();
const router = useRouter();
const lobby = useLobbyStore();
const matches = useMatchesStore();
const settings = useSettingsStore();

const confirmLeave = ref(false);
const selectedId = ref<LobbyArtKind | null>(null);
const buttons: (HTMLButtonElement | null)[] = [];

const go = (path: string) => void router.push(path);

function leaveLobby() {
  lobby.leave();
  go(PATHS.landing);
}

const paired = computed(() => lobby.session === 'paired');
const phoneLive = computed(
  () =>
    paired.value &&
    lobby.pairing !== null &&
    (lobby.pairState === 'connected' || lobby.pairState === 'connecting'),
);
const inProgress = computed(() => matches.match !== null && !matches.match.finished && matches.match.events.length > 0);
const battery = computed(() => shownBattery(lobby.phone));

// The menu, first entry first: whatever matters most right now leads.
const entries = computed<Entry[]>(() => [
  ...(paired.value && !phoneLive.value
    ? [
        {
          id: 'pairAgain' as const,
          label: t.lobby.pairAgain,
          description: t.lobby.describe.pairAgain,
          run: () => {
            lobby.clearPairing();
            go(PATHS.pairLaptop);
          },
        },
      ]
    : []),
  ...(inProgress.value
    ? [{ id: 'resume' as const, label: t.lobby.resume, description: t.lobby.describe.resume, run: () => go(PATHS.game) }]
    : []),
  { id: 'newGame', label: t.lobby.newGame, description: t.lobby.describe.newGame, run: () => go(PATHS.setup) },
  {
    id: 'camera',
    label: settings.settings.calibration ? t.lobby.camera : t.lobby.cameraFirst,
    description: t.lobby.describe.camera,
    run: () => go(PATHS.camera),
  },
  { id: 'review', label: t.review.open, description: t.lobby.describe.review, run: () => go(PATHS.review) },
  { id: 'history', label: t.lobby.history, description: t.lobby.describe.history, run: () => go(PATHS.history) },
  { id: 'stats', label: t.lobby.stats, description: t.lobby.describe.stats, run: () => go(PATHS.stats) },
  {
    id: 'leave',
    label: t.lobby.leave,
    description: paired.value && lobby.pairing ? t.lobby.describe.leavePaired : t.lobby.describe.leave,
    // Leaving solo costs nothing; leaving two devices ends the pairing, which
    // is the one thing this screen exists to protect.
    run: () => {
      if (paired.value && lobby.pairing) confirmLeave.value = true;
      else leaveLobby();
    },
  },
]);
const selected = computed(() => entries.value.find((entry) => entry.id === selectedId.value) ?? entries.value[0]!);

/** Up and down move through the menu, wrapping; Home and End jump to its ends. */
function onKeyDown(event: KeyboardEvent) {
  const list = entries.value;
  const at = list.findIndex((entry) => entry.id === selected.value.id);
  const to =
    event.key === 'ArrowDown'
      ? (at + 1) % list.length
      : event.key === 'ArrowUp'
        ? (at - 1 + list.length) % list.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? list.length - 1
            : -1;
  if (to < 0) return;
  event.preventDefault();
  selectedId.value = list[to]!.id;
  buttons[to]?.focus();
}

const keep = (index: number) => (element: unknown) => {
  buttons[index] = element as HTMLButtonElement | null;
};
</script>

<template>
  <!-- An address that points here with no session behind it (a bookmark, a new
       tab): there is nothing to show until a mode is chosen. -->
  <ScreenShell v-if="!lobby.session" name="lobby" :title="t.lobby.title" :lead="t.lobby.noSession">
    <template #actions>
      <button type="button" class="primary" @click="go(PATHS.start)">{{ t.lobby.chooseMode }}</button>
    </template>
  </ScreenShell>

  <div v-else class="lobby">
    <!-- The selected entry's picture; keyed so a new one fades in. -->
    <div class="lobby-art" aria-hidden="true">
      <div :key="selected.id" :class="`lobby-art-frame lobby-art-${selected.id}`">
        <LobbyArt :kind="selected.id" />
      </div>
    </div>

    <div class="lobby-content">
      <header class="lobby-head">
        <h1 class="lobby-kicker">{{ t.lobby.title }} · {{ paired ? t.lobby.pairedShort : t.lobby.soloShort }}</h1>

        <div v-if="paired" :class="`coach ${phoneLive ? 'coach-ready' : 'coach-warn'}`" role="status">
          <span class="coach-dot" aria-hidden="true" />
          <span class="coach-message">
            {{
              phoneLive
                ? lobby.pairState === 'connecting'
                  ? t.lobby.phoneReconnecting
                  : t.lobby.phoneConnected
                : lobby.pairing
                  ? t.lobby.phoneLost
                  : t.lobby.phoneGoneAfterReload
            }}
          </span>
          <span v-if="phoneLive && lobby.phone" class="coach-numbers">
            <template v-if="battery !== undefined">
              {{ fill(t.lobby.battery, { n: battery, charging: lobby.phone.charging ? t.lobby.charging : '' }) }}
            </template>
            {{ lobby.phone.width && lobby.phone.height ? ` · ${lobby.phone.width}×${lobby.phone.height}` : '' }}
          </span>
        </div>

        <p class="lobby-title" aria-hidden="true">{{ selected.label }}</p>
        <p id="lobby-desc" class="lobby-desc">{{ selected.description }}</p>
      </header>

      <div v-if="confirmLeave" class="panel lobby-confirm" role="alertdialog" :aria-label="t.lobby.leaveTitle">
        <p>{{ t.lobby.leavePaired }}</p>
        <div class="controls">
          <button type="button" class="primary" @click="leaveLobby">{{ t.lobby.leaveConfirm }}</button>
          <button type="button" class="chip" @click="confirmLeave = false">{{ t.lobby.stay }}</button>
        </div>
      </div>

      <nav class="lobby-menu" :aria-label="t.lobby.title">
        <ul @keydown="onKeyDown">
          <li v-for="(entry, index) in entries" :key="entry.id">
            <!-- Selected on a move, not on entering: an entry can slide under a
                 still pointer, and that is not the person choosing it. -->
            <button
              :ref="keep(index)"
              type="button"
              :class="['lobby-item', { 'lobby-item-on': entry.id === selected.id, 'lobby-item-leave': entry.id === 'leave' }]"
              :aria-current="entry.id === selected.id ? 'true' : undefined"
              :aria-describedby="entry.id === selected.id ? 'lobby-desc' : undefined"
              @pointermove="selectedId = entry.id"
              @focus="selectedId = entry.id"
              @click="entry.run"
            >
              {{ entry.label }}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  </div>
</template>
