<!--
  The match in play: the scoreboard, who is at the oche and their darts, the
  board or the keypad to enter them, and the camera.

  Which visit's darts are in the board, and where it stands (throwing, open,
  held or closed), is the game visit's (game/gameVisit.ts); so is what the
  camera sees of it. The screen shows it, plays its sounds, and owns whether a
  report is open.
-->
<script setup lang="ts">
import { formatRoute, type Hit, type Point } from '@treblewise/core';
import { computed, onMounted, onScopeDispose, ref, shallowRef } from 'vue';
import { useRouter } from 'vue-router';

import { unlockCaller } from '../caller/caller.js';
import { loadSounds, playBust, playThud, playTurn, unlockSounds } from '../caller/sounds.js';
import Dartboard, { type BoardDart } from '../components/Dartboard.vue';
import GameCamera from '../components/GameCamera.vue';
import Keypad from '../components/Keypad.vue';
import Scoreboard from '../components/Scoreboard.vue';
import ThrowStrip from '../components/ui/ThrowStrip.vue';
import FullscreenButton from '../components/ui/FullscreenButton.vue';
import Toggle from '../components/ui/Toggle.vue';
import { useGameVisit } from '../composables/useGameVisit.js';
import { fill, useStrings } from '../i18n/index.js';
import { PATHS } from '../router/paths.js';
import { useLobbyStore, useMatchesStore, useSettingsStore } from '../store/stores.js';
import type { GrabbedFrame } from '../vision/camera.js';

const t = useStrings();
const router = useRouter();
const matches = useMatchesStore();
const settings = useSettingsStore();
const lobby = useLobbyStore();

/** id of the dart being corrected, if any. */
const correcting = ref<string | null>(null);
/** The photograph the game visit's report is open on: the game decides when, the camera shows it. */
const reportOn = shallowRef<GrabbedFrame | null>(null);

const autoscoring = computed(() => settings.settings.keepFrames && settings.settings.autoscoreGames);
const { gameVisit, state: visitState } = useGameVisit({
  snapshot: () => matches.snapshot,
  autoscoring,
  calibration: () => settings.settings.calibration,
});

// The game visit says when the autoscorer entered a dart and when the turn
// passes; the sounds are the game's. Decoded now, so the first dart is heard.
onMounted(() => void loadSounds());
onScopeDispose(
  gameVisit.listen((signal) => {
    if (!settings.settings.soundsEnabled) return;
    if (signal === 'turn-passed') {
      playTurn();
      return;
    }
    playThud();
    if (signal === 'dart-bust') playBust();
  }),
);

const snapshot = computed(() => matches.snapshot);
const current = computed(() => snapshot.value?.current ?? null);
const finished = computed(() => snapshot.value?.winnerId != null);

// The visit being thrown, or between visits the one just thrown, so its darts
// stay on the board until the next player throws: a player walking back from
// the board should still see where their darts landed.
const visit = computed(() => visitState.value.visit);
const position = computed(() => visitState.value.position);
const visitIsCurrent = computed(() => position.value === 'throwing');
// The visit just thrown, for as long as it is correctable here.
const lastVisit = computed(() => (position.value === 'open' || position.value === 'held' ? visit.value : null));
// Held, with the autoscorer scoring: the screen stays on the player who just
// threw until the darts come out. The next player is not at the oche yet, and
// the finished visit is the one anyone looks at to check it. The score itself
// has moved on; only what is shown waits.
const held = computed(() => position.value === 'held');

const nameOf = (id: string) => snapshot.value?.config.players.find((p) => p.id === id)?.name ?? '';

const canReport = computed(() => settings.settings.keepFrames && visitState.value.reportable);
function openReport() {
  if (canReport.value && !reportOn.value && visitState.value.photo) reportOn.value = visitState.value.photo;
}

const pick = (id: string) => {
  correcting.value = correcting.value === id ? null : id;
};

const visitDarts = computed<BoardDart[]>(() =>
  (visit.value?.darts ?? []).map((dart) => ({
    id: dart.id,
    hit: dart.hit,
    ...(dart.pos ? { pos: dart.pos } : {}),
    past: !visitIsCurrent.value,
  })),
);

const target = computed(() =>
  held.value ? null : (current.value?.checkout?.[visitIsCurrent.value ? (visit.value?.darts.length ?? 0) : 0] ?? null),
);

function record(hit: Hit, pos?: Point) {
  unlockCaller();
  unlockSounds();
  if (correcting.value) {
    matches.correctDart(correcting.value, hit, pos);
    correcting.value = null;
    return;
  }
  const thrown = matches.throwDart(hit, pos ? { pos } : {});
  if (settings.settings.soundsEnabled) {
    playThud();
    if (thrown?.busted) playBust();
  }
}

const callerOn = computed({ get: () => settings.settings.callerEnabled, set: () => settings.toggleCaller() });
const namesOn = computed({ get: () => settings.settings.callNames, set: () => settings.toggleNames() });
const soundsOn = computed({
  get: () => settings.settings.soundsEnabled,
  set: () => {
    unlockSounds();
    settings.toggleSounds();
  },
});

const winnerName = computed(() => {
  const s = snapshot.value;
  return s ? (s.config.players.find((p) => p.id === s.winnerId)?.name ?? s.winnerId ?? '') : '';
});

function markVisit() {
  correcting.value = null;
  openReport();
}
</script>

<template>
  <div v-if="snapshot" class="screen screen-game">
    <Scoreboard :snapshot="snapshot" :holding="held && lastVisit ? lastVisit.playerId : null" />

    <ThrowStrip
      v-if="held && lastVisit && current"
      variant="held"
      :who="fill(t.game.pullOut, { name: nameOf(lastVisit.playerId) })"
      :darts="lastVisit.darts"
      :correcting="correcting"
      pickable
      :hint="t.game.correctingHint"
      @pick="pick"
    >
      <!-- One row, always the same height: while a dart of this visit is being
           corrected, "Mark where they landed" takes its place beside "Darts
           out" instead of being searched for further down. -->
      <template #actions>
        <div class="held-actions">
          <button type="button" class="primary darts-out" @click="gameVisit.dartsOut()">
            {{ fill(t.game.dartsOut, { name: nameOf(current.playerId) }) }}
          </button>
          <button
            v-if="correcting && canReport && lastVisit.darts.some((dart) => dart.id === correcting)"
            type="button"
            class="chip held-mark"
            @click="markVisit"
          >
            {{ t.report.markVisit }}
          </button>
        </div>
      </template>
    </ThrowStrip>

    <ThrowStrip
      v-if="current && !held"
      :who="`${nameOf(current.playerId)} ${t.game.toThrow}`"
      :darts="visitIsCurrent ? (visit?.darts ?? []) : []"
      :empty="visitIsCurrent ? Math.max(0, 3 - (visit?.darts.length ?? 0)) : 3"
      :correcting="correcting"
      pickable
      :hint="t.game.correctingHint"
      @pick="pick"
    />

    <ThrowStrip
      v-if="position === 'open' && lastVisit"
      variant="last"
      :who="fill(t.game.lastVisit, { name: nameOf(lastVisit.playerId) })"
      :darts="lastVisit.darts"
      :correcting="correcting"
      pickable
      :hint="t.game.correctingHint"
      @pick="pick"
    />
    <p v-if="correcting" class="hint">{{ t.game.correctingHint }}</p>

    <div class="entry">
      <Dartboard
        v-if="settings.settings.entryMode === 'board'"
        interactive
        :darts="visitDarts"
        :target="target"
        :disabled="finished"
        @hit="record"
      />
      <Keypad v-else :disabled="finished" @hit="(hit) => record(hit)" />
    </div>

    <p v-if="current?.checkout && !held" class="checkout-line" :title="t.game.chartNote">
      {{ t.game.checkout }}: <b>{{ formatRoute(current.checkout) }}</b>
    </p>

    <div class="controls">
      <button type="button" class="chip" @click="matches.undo()">{{ t.game.undo }}</button>
      <Toggle v-model="callerOn" :label="callerOn ? t.game.callerOn : t.game.callerOff" />
      <Toggle v-if="callerOn" v-model="namesOn" :label="namesOn ? t.game.namesOn : t.game.namesOff" />
      <Toggle v-model="soundsOn" :label="soundsOn ? t.game.soundsOn : t.game.soundsOff" />
      <FullscreenButton class="chip" />
      <button
        type="button"
        class="chip"
        @click="settings.setEntryMode(settings.settings.entryMode === 'board' ? 'keypad' : 'board')"
      >
        {{ settings.settings.entryMode === 'board' ? t.game.keypad : t.game.board }}
      </button>
      <button type="button" class="chip" @click="router.push(PATHS.stats)">{{ t.stats.title }}</button>
      <button type="button" class="chip" @click="router.push(PATHS.setup)">{{ t.game.newMatch }}</button>
      <button v-if="lobby.session" type="button" class="chip" @click="router.push(PATHS.lobby)">{{ t.lobby.back }}</button>
    </div>

    <p v-if="settings.settings.entryMode === 'board' && !finished" class="hint">{{ t.game.sourceNote }}</p>

    <GameCamera
      v-if="matches.match"
      :match-id="matches.match.id"
      :game-visit="gameVisit"
      :can-throw="current !== null && !finished"
      :report="reportOn"
      @report="openReport"
      @close-report="reportOn = null"
      @correct="(dartId, hit, pos) => matches.correctDart(dartId, hit, pos)"
    />

    <div v-if="finished" class="overlay">
      <div class="overlay-card">
        <h2>{{ fill(t.game.matchWon, { name: winnerName }) }}</h2>
        <button type="button" class="primary" @click="router.push(PATHS.setup)">{{ t.game.newMatch }}</button>
      </div>
    </div>
  </div>
</template>
