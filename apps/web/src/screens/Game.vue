<!--
  The match in play (issue #15), after DartCounter's Omni screen: the players
  on the left, the visit in the middle (who throws, three dart cards, the
  board or the keypad to enter them), the leg visit by visit on the right.
  The top bar has the way out, the camera's state, what is being played,
  and the screen's tools.

  Which visit's darts are in the board, and where it stands (throwing, open,
  held or closed), is the game visit's (game/gameVisit.ts); so is what the
  camera sees of it. The screen shows it, plays its sounds, and owns whether a
  report is open.
-->
<script setup lang="ts">
import { formatHit, type Dart, type Hit, type Point, type Visit } from '@treblewise/core';
import { computed, onMounted, onScopeDispose, ref, shallowRef } from 'vue';
import { useRouter } from 'vue-router';

import { unlockCaller } from '../caller/caller.js';
import { loadSounds, playBust, playThud, playTurn, unlockSounds } from '../caller/sounds.js';
import DartCard, { type CardDart } from '../components/DartCard.vue';
import Dartboard, { type BoardDart } from '../components/Dartboard.vue';
import GameCamera from '../components/GameCamera.vue';
import Keypad from '../components/Keypad.vue';
import PlayerCard, { type VisitBar } from '../components/PlayerCard.vue';
import VisitSheet, { type SheetVisit } from '../components/VisitSheet.vue';
import Icon from '../components/ui/Icon.vue';
import Switch from '../components/ui/Switch.vue';
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

/** id of the dart being corrected, if any: any dart of the leg. */
const correcting = ref<string | null>(null);
/** The photograph the game visit's report is open on: the game decides when, the camera shows it. */
const reportOn = shallowRef<GrabbedFrame | null>(null);
/** The top bar's open popover. */
const menu = ref<'sound' | 'more' | null>(null);
/** The visits column, or a two-column screen without it. */
const sheetOn = ref(true);

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
const players = computed(() => snapshot.value?.config.players ?? []);

// The visit being thrown, or between visits the one just thrown, so its darts
// stay on the board until the next player throws.
const visit = computed(() => visitState.value.visit);
const position = computed(() => visitState.value.position);
const visitIsCurrent = computed(() => position.value === 'throwing');
// Held, with the autoscorer scoring: the screen stays on the player who just
// threw until the darts come out. The score itself has moved on; only what is
// shown waits.
const held = computed(() => position.value === 'held');
const holder = computed(() => (held.value && visit.value ? visit.value.playerId : null));

const nameOf = (id: string) => players.value.find((p) => p.id === id)?.name ?? '';

const canReport = computed(() => settings.settings.keepFrames && visitState.value.reportable);
function openReport() {
  correcting.value = null;
  if (canReport.value && !reportOn.value && visitState.value.photo) reportOn.value = visitState.value.photo;
}

const pick = (id: string) => {
  correcting.value = correcting.value === id ? null : id;
};

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
const keypad = computed(() => settings.settings.entryMode === 'keypad');
const toggleEntry = () => settings.setEntryMode(keypad.value ? 'board' : 'keypad');
const toggleMenu = (which: 'sound' | 'more') => (menu.value = menu.value === which ? null : which);
const go = (path: string) => {
  menu.value = null;
  void router.push(path);
};

const scored = (v: Visit) => (v.busted ? 0 : v.darts.reduce((sum, dart) => sum + dart.scored, 0));

/** "501 · First to 3 legs · 1–1". */
const title = computed(() => {
  const s = snapshot.value;
  if (!s) return '';
  const sets = s.config.setsToWin > 1;
  const target = sets
    ? fill(t.game.firstToSets, { n: s.config.setsToWin })
    : s.config.legsPerSet === 1
      ? t.game.firstToLeg
      : fill(t.game.firstToLegs, { n: s.config.legsPerSet });
  const score = s.config.players.map((p) => (sets ? s.setsWon[p.id] : s.legsWon[p.id]) ?? 0).join('–');
  return `${s.config.startScore} · ${target} · ${score}`;
});

const leg = computed(() => snapshot.value?.legs.at(-1) ?? null);
// Once a leg is won, every card shows the next leg's start score: the won
// leg's zero (and the loser's remainder) belongs to the history.
const legOver = computed(() => leg.value?.winnerId != null);

const cards = computed(() => {
  const s = snapshot.value;
  if (!s) return [];
  return s.config.players.map((player) => {
    const isNext = !holder.value && s.current?.playerId === player.id;
    const visits = legOver.value ? [] : (leg.value?.visits ?? []).filter((v) => v.playerId === player.id);
    const darts = visits.reduce((sum, v) => sum + v.darts.length, 0);
    const points = visits.reduce((sum, v) => sum + scored(v), 0);
    return {
      id: player.id,
      name: player.name,
      remaining: isNext
        ? s.current!.remaining
        : legOver.value
          ? s.config.startScore
          : (leg.value?.remaining[player.id] ?? s.config.startScore),
      legsWon: s.legsWon[player.id] ?? 0,
      setsWon: s.config.setsToWin > 1 ? (s.setsWon[player.id] ?? 0) : null,
      starts: !legOver.value && leg.value?.startingPlayerId === player.id,
      current: holder.value ? holder.value === player.id : s.current?.playerId === player.id,
      legAverage: darts > 0 ? (points / darts) * 3 : null,
      visits: visits.map<VisitBar>((v) => ({ score: scored(v), bust: v.busted, live: !v.complete })),
    };
  });
});

/** The darts the cards show: the visit being thrown, or the one held in the board. */
const shownDarts = computed<Dart[]>(() => (visitIsCurrent.value || held.value ? (visit.value?.darts ?? []) : []));
const slots = computed(() =>
  [0, 1, 2].map((index) => {
    const dart = shownDarts.value[index];
    if (dart) {
      const card: CardDart = {
        id: dart.id,
        hit: dart.hit,
        ...(dart.pos ? { pos: dart.pos } : {}),
        source: dart.source,
        corrected: dart.original !== undefined,
        bust: visit.value?.busted === true && index === (visit.value?.darts.length ?? 0) - 1,
      };
      return { index, dart: card, aim: null, waiting: false };
    }
    const thrown = shownDarts.value.length;
    const route = !held.value && !correcting.value ? current.value?.checkout : null;
    return {
      index,
      dart: null,
      aim: route?.[index - thrown] ?? null,
      waiting: visitIsCurrent.value || position.value === 'open' || position.value === 'closed',
    };
  }),
);
const waitingText = computed(() => (visitState.value.reading ? t.game.reading : t.game.waiting));

const target = computed(() =>
  held.value || correcting.value ? null : (current.value?.checkout?.[visitIsCurrent.value ? (visit.value?.darts.length ?? 0) : 0] ?? null),
);
const boardDarts = computed<BoardDart[]>(() =>
  shownDarts.value.map((dart) => ({ id: dart.id, hit: dart.hit, ...(dart.pos ? { pos: dart.pos } : {}) })),
);

const heading = computed(() => {
  if (correcting.value) return keypad.value ? t.game.correctingPress : t.game.correctingTap;
  if (holder.value) return fill(t.game.pullOutName, { name: nameOf(holder.value) });
  const now = current.value;
  if (!now) return '';
  return now.checkout
    ? fill(t.game.require, { name: nameOf(now.playerId), n: now.remaining })
    : fill(t.game.toThrowName, { name: nameOf(now.playerId) });
});

/** The leg visit by visit, newest first. */
const sheet = computed<SheetVisit[]>(() => {
  const visits = [...(leg.value?.visits ?? [])].reverse();
  const reportVisit = visit.value;
  let lastSeen = false;
  return visits.map((v, index) => {
    const live = !v.complete && !legOver.value;
    const last = !live && !lastSeen;
    if (last) lastSeen = true;
    const name = nameOf(v.playerId);
    const total = scored(v);
    return {
      key: `${v.setIndex}-${v.legIndex}-${visits.length - index}`,
      player: players.value.findIndex((p) => p.id === v.playerId),
      name: live ? fill(t.game.now, { name }) : name,
      total: v.busted ? t.game.busted : `= ${total}`,
      left: live ? '' : fill(t.game.left, { n: v.scoreAfter }),
      darts: v.darts.map((dart) => ({
        id: dart.id,
        label: formatHit(dart.hit),
        hand: autoscoring.value && dart.source !== 'auto',
        was: dart.original ? formatHit(dart.original.hit) : null,
      })),
      live,
      last,
      bust: v.busted,
      markable: reportVisit !== null && v.darts[0]?.id === reportVisit.darts[0]?.id,
    };
  });
});

const winnerName = computed(() => {
  const s = snapshot.value;
  return s ? (s.config.players.find((p) => p.id === s.winnerId)?.name ?? s.winnerId ?? '') : '';
});
const nextName = computed(() => (current.value ? nameOf(current.value.playerId) : ''));
</script>

<template>
  <div v-if="snapshot" class="game">
    <header class="game-top">
      <div class="game-top-side">
        <button
          type="button"
          class="btn-quiet btn-icon"
          :aria-label="t.game.leave"
          @click="go(lobby.session ? PATHS.lobby : PATHS.setup)"
        >
          <Icon name="back" />
        </button>
        <div id="game-camera-badge" class="game-camera-slot" />
      </div>
      <p class="game-title">{{ title }}</p>
      <div class="game-top-side game-top-tools">
        <!-- One button: it shows what pressing it switches to. -->
        <button type="button" class="btn-quiet btn-icon" :aria-label="keypad ? t.game.toBoard : t.game.toKeypad" :title="keypad ? t.game.toBoard : t.game.toKeypad" @click="toggleEntry">
          <Icon :name="keypad ? 'board' : 'keypad'" />
        </button>
        <button type="button" class="btn-quiet btn-icon" :aria-label="t.game.soundMenu" :aria-expanded="menu === 'sound'" @click="toggleMenu('sound')">
          <Icon :name="callerOn ? 'speaker' : 'speaker-off'" />
        </button>
        <button type="button" class="btn-quiet btn-icon" :aria-label="t.game.menu" :aria-expanded="menu === 'more'" @click="toggleMenu('more')">
          <Icon name="menu" />
        </button>
      </div>
    </header>

    <div :class="['game-body', { 'game-body-wide': !sheetOn }]">
      <section class="game-players" :aria-label="t.setup.players">
        <PlayerCard
          v-for="card in cards"
          :key="card.id"
          :name="card.name"
          :remaining="card.remaining"
          :legs-won="card.legsWon"
          :legs-to-win="snapshot.config.legsPerSet"
          :sets-won="card.setsWon"
          :starts="card.starts"
          :current="card.current"
          :leg-average="card.legAverage"
          :visits="card.visits"
        />
      </section>

      <section class="game-visit" :aria-label="t.game.visit">
        <div class="game-visit-head">
          <h1 :class="['game-heading', { 'game-heading-held': holder, 'game-heading-fix': correcting }]">{{ heading }}</h1>
          <div class="game-visit-tools">
            <button v-if="correcting" type="button" class="btn-quiet" @click="correcting = null">{{ t.game.cancel }}</button>
            <button type="button" @click="matches.undo()">{{ t.game.undo }}</button>
          </div>
        </div>

        <div class="dart-slots">
          <DartCard
            v-for="slot in slots"
            :key="slot.index"
            :dart="slot.dart"
            :index="slot.index"
            :picked="slot.dart !== null && correcting === slot.dart.id"
            :aim="slot.aim"
            :waiting="slot.waiting && !finished"
            :waiting-text="waitingText"
            @pick="slot.dart && pick(slot.dart.id)"
          />
        </div>

        <div v-if="held && current && !correcting" class="held-row">
          <button type="button" class="btn-primary btn-xl darts-out" @click="gameVisit.dartsOut()">
            {{ fill(t.game.dartsOutNext, { name: nextName }) }}
          </button>
          <button v-if="!sheetOn && canReport" type="button" class="held-mark" @click="openReport">{{ t.game.markPhoto }}</button>
        </div>

        <div class="game-entry">
          <Keypad v-if="keypad" :disabled="finished" :aim="target" @hit="(hit) => record(hit)" />
          <Dartboard v-else interactive :darts="boardDarts" :target="target" :disabled="finished" @hit="record" />
        </div>
      </section>

      <VisitSheet
        v-if="sheetOn"
        :title="fill(t.game.visitsTitle, { n: snapshot.legs.length })"
        :visits="sheet"
        :picked="correcting"
        :can-mark="canReport"
        @pick="pick"
        @mark="openReport"
        @hide="sheetOn = false"
      />
    </div>

    <!-- The visits, hidden: a tab on the edge where the column was. -->
    <button v-if="!sheetOn" type="button" class="sheet-tab" :aria-label="t.game.showVisits" @click="sheetOn = true">
      <Icon name="back" :size="18" />
      <span>{{ t.game.visitsTab }}</span>
    </button>

    <!-- The top bar's popovers. -->
    <div v-if="menu" class="popover-scrim" @click="menu = null" />
    <div v-if="menu === 'sound'" class="popover popover-sound" role="dialog" :aria-label="t.game.soundMenu">
      <Switch v-model="callerOn" :label="t.game.callerSwitch" :note="t.game.callerNote" />
      <Switch v-if="callerOn" v-model="namesOn" :label="t.game.namesSwitch" :note="t.game.namesNote" />
      <Switch v-model="soundsOn" :label="t.game.soundsSwitch" :note="t.game.soundsNote" />
    </div>
    <div v-if="menu === 'more'" class="popover popover-menu" role="dialog" :aria-label="t.game.menu">
      <span class="label">{{ t.report.camera }}</span>
      <div id="game-menu-camera" />
      <span class="popover-rule" />
      <button type="button" class="popover-item" @click="go(PATHS.stats)">{{ t.stats.title }}</button>
      <button v-if="lobby.session" type="button" class="popover-item" @click="go(PATHS.lobby)">{{ t.lobby.back }}</button>
      <button type="button" class="popover-item" @click="go(PATHS.setup)">{{ t.game.newMatch }}</button>
    </div>

    <GameCamera
      v-if="matches.match"
      :match-id="matches.match.id"
      :game-visit="gameVisit"
      :can-throw="current !== null && !finished"
      :report="reportOn"
      badge-target="#game-camera-badge"
      :settings-target="menu === 'more' ? '#game-menu-camera' : null"
      @report="openReport"
      @close-report="reportOn = null"
      @correct="(dartId, hit, pos) => matches.correctDart(dartId, hit, pos)"
    />

    <div v-if="finished" class="overlay">
      <div class="overlay-card">
        <h2>{{ fill(t.game.matchWon, { name: winnerName }) }}</h2>
        <button type="button" class="btn-primary btn-lg" @click="router.push(PATHS.setup)">{{ t.game.newMatch }}</button>
      </div>
    </div>
  </div>
</template>
