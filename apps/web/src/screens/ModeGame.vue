<!--
  A game other than X01 in play (issue #22), laid out like the X01 screen
  (Game.vue) so nothing has to be learnt twice: the players on the left (a
  cricket board in cricket), the visit in the middle with the three dart cards
  and the board or the keypad, the visits on the right. The dart cards and the
  board show where to aim when the game has one target (around the clock,
  Bob's 27, Shanghai…).

  The camera, the pull-out, undo and the corrections are the same as in X01:
  the game visit (game/gameVisit.ts) follows any game's snapshot.
-->
<script setup lang="ts">
import { formatHit, isX01Snapshot, legsToWin, type Dart, type Hit, type Point } from '@treblewise/core';
import { computed, nextTick, onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';

import { unlockCaller } from '../caller/caller.js';
import { loadSounds, playBust, playThud, playTurn, unlockSounds } from '../caller/sounds.js';
import CricketBoard from '../components/CricketBoard.vue';
import DartCard, { type CardDart } from '../components/DartCard.vue';
import Dartboard, { type BoardDart } from '../components/Dartboard.vue';
import GameCamera from '../components/GameCamera.vue';
import Keypad from '../components/Keypad.vue';
import ModePlayerCard from '../components/ModePlayerCard.vue';
import ResultCard from '../components/ResultCard.vue';
import VisitSheet, { type SheetVisit } from '../components/VisitSheet.vue';
import Icon from '../components/ui/Icon.vue';
import Switch from '../components/ui/Switch.vue';
import { useGameVisit } from '../composables/useGameVisit.js';
import { legHow, modeCards, modeHeading, modeRows, modeTitle, visitLine } from '../game/modeView.js';
import { rematchConfig } from '../game/throwOrder.js';
import { fill, useStrings } from '../i18n/index.js';
import { PATHS } from '../router/paths.js';
import { useLobbyStore, useMatchesStore, useSettingsStore } from '../store/stores.js';
import type { GrabbedFrame } from '../vision/camera.js';

const t = useStrings();
const router = useRouter();
const matches = useMatchesStore();
const settings = useSettingsStore();
const lobby = useLobbyStore();

const correcting = ref<string | null>(null);
const reportOn = shallowRef<GrabbedFrame | null>(null);
const menu = ref<'sound' | 'more' | null>(null);
const sheetOn = ref(true);

const autoscoring = computed(() => settings.settings.keepFrames && settings.settings.autoscoreGames);
const { gameVisit, state: visitState } = useGameVisit({
  snapshot: () => matches.snapshot,
  autoscoring,
  calibration: () => settings.settings.calibration,
});

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

const snapshot = computed(() => (matches.snapshot && !isX01Snapshot(matches.snapshot) ? matches.snapshot : null));
const current = computed(() => snapshot.value?.current ?? null);
const finished = computed(() => snapshot.value !== null && snapshot.value.current === null);
const players = computed(() => snapshot.value?.config.players ?? []);
const legs = computed(() => (snapshot.value ? legsToWin(snapshot.value.config) : 1));

const visit = computed(() => visitState.value.visit);
const position = computed(() => visitState.value.position);
const visitIsCurrent = computed(() => position.value === 'throwing');
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

const title = computed(() => (snapshot.value ? modeTitle(snapshot.value) : ''));
const leg = computed(() => snapshot.value?.legs.at(-1) ?? null);
const legOver = computed(() => leg.value?.over === true);
const cards = computed(() => (snapshot.value ? modeCards(snapshot.value, holder.value) : []));
const many = computed(() => cards.value.length > 2);

const cricket = computed(() => {
  const s = snapshot.value;
  if (!s || s.config.mode !== 'cricket') return null;
  const l = leg.value;
  return {
    // Between legs the board is wiped for the next one; at the end it stays as it ended.
    state: l && (!l.over || finished.value) && l.state.kind === 'cricket' ? l.state : null,
    points: s.config.scoring !== 'noScore',
    starts: l && !l.over ? l.startingPlayerId : null,
  };
});

const playersList = ref<HTMLElement | null>(null);
watch(
  () => cards.value.find((card) => card.current)?.id,
  async () => {
    await nextTick();
    const list = playersList.value;
    const card = list?.querySelector('.player-card-on');
    if (!list || !card || list.scrollHeight <= list.clientHeight) return;
    const box = list.getBoundingClientRect();
    const at = card.getBoundingClientRect();
    const by = at.top < box.top ? at.top - box.top : at.bottom > box.bottom ? at.bottom - box.bottom : 0;
    if (by !== 0) list.scrollBy({ top: by, behavior: 'smooth' });
  },
);

const shownDarts = computed<Dart[]>(() => (visitIsCurrent.value || held.value ? (visit.value?.darts ?? []) : []));
/** Where to aim with the next dart: the one target, when the game has one. */
const aim = computed(() => (held.value || correcting.value ? null : (current.value?.aim ?? null)));
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
        bust: false,
      };
      return { index, dart: card, aim: null, waiting: false };
    }
    const thrown = shownDarts.value.length;
    return {
      index,
      dart: null,
      // The next dart's target only: where the later ones go depends on it.
      aim: index === thrown ? aim.value : null,
      waiting: visitIsCurrent.value || position.value === 'open' || position.value === 'closed',
    };
  }),
);
const waitingText = computed(() => (visitState.value.reading ? t.game.reading : t.game.waiting));
const boardDarts = computed<BoardDart[]>(() =>
  shownDarts.value.map((dart) => ({ id: dart.id, hit: dart.hit, ...(dart.pos ? { pos: dart.pos } : {}) })),
);

const heading = computed(() => {
  if (correcting.value) return keypad.value ? t.game.correctingPress : t.game.correctingTap;
  if (holder.value) return fill(t.game.pullOutName, { name: nameOf(holder.value) });
  return snapshot.value ? modeHeading(snapshot.value) : '';
});

/** The leg visit by visit, newest first. */
const sheet = computed<SheetVisit[]>(() => {
  const s = snapshot.value;
  if (!s) return [];
  const visits = [...(leg.value?.visits ?? [])].reverse();
  const reportVisit = visit.value;
  let lastSeen = false;
  return visits.map((v, index) => {
    const live = !v.complete && !legOver.value;
    const last = !live && !lastSeen;
    if (last) lastSeen = true;
    const name = nameOf(v.playerId);
    const line = visitLine(s, v);
    return {
      key: `${v.legIndex}-${visits.length - index}`,
      player: players.value.findIndex((p) => p.id === v.playerId),
      name: live ? fill(t.game.now, { name }) : name,
      total: line.total,
      left: live ? '' : line.left,
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

const nextName = computed(() => (current.value ? nameOf(current.value.playerId) : ''));

// ---------- a leg or the game decided ----------

const decidingDart = computed(() => (legOver.value ? (leg.value?.visits.at(-1)?.darts.at(-1)?.id ?? null) : null));
const putAway = ref<string | null>(null);
const legCardOn = computed(() => !finished.value && decidingDart.value !== null && putAway.value !== decidingDart.value);

function nextLeg() {
  putAway.value = decidingDart.value;
  if (held.value) gameVisit.dartsOut();
}

const standing = computed(() => {
  const s = snapshot.value;
  if (!s || s.config.players.length < 2 || legs.value <= 1) return '';
  const won = (id: string) => s.legsWon[id] ?? 0;
  const order = [...s.config.players].sort((a, b) => won(b.id) - won(a.id));
  const score = order.map((p) => won(p.id)).join('–');
  const [first, second] = [order[0]!, order[1]!];
  return won(first.id) === won(second.id) ? fill(t.game.levelAt, { score }) : fill(t.game.leads, { name: first.name, score });
});

const result = computed(() => {
  const s = snapshot.value;
  const l = leg.value;
  if (!s || !l) return null;
  return { rows: modeRows(s, finished.value ? s.legs : [l]) };
});

const legTitle = computed(() => {
  const l = leg.value;
  if (!l?.over) return '';
  return l.winnerId ? fill(t.game.legWon, { name: nameOf(l.winnerId) }) : t.modes.play.noLeg;
});
const legSub = computed(() => {
  const s = snapshot.value;
  const l = leg.value;
  return s && l ? [standing.value, legHow(s, l)].filter(Boolean).join(' · ') : '';
});

const matchTitle = computed(() => {
  const s = snapshot.value;
  const l = leg.value;
  if (!s || !l) return '';
  if (s.endedEarly) return s.winnerId ? fill(t.game.matchWon, { name: nameOf(s.winnerId) }) : standing.value;
  // A drill ended level.
  if (s.winnerId === null) return fill(t.modes.play.drawnAt, { n: l.remaining[s.config.players[0]!.id] ?? 0 });
  if (legs.value > 1) {
    const score = s.config.players.map((p) => s.legsWon[p.id] ?? 0).sort((x, y) => y - x).join('–');
    return fill(t.game.matchWonScore, { name: nameOf(s.winnerId), score });
  }
  // Alone at a game played for points, there is nobody to beat: the score is the result.
  const forPoints = !['cricket', 'aroundTheClock', 'killer'].includes(s.config.mode);
  if (s.config.players.length === 1 && forPoints) return fill(t.modes.play.finishedWith, { n: l.remaining[s.winnerId] ?? 0 });
  return legHow(s, l);
});
const matchSub = computed(() => {
  const s = snapshot.value;
  if (!s) return '';
  const done = s.legs.filter((l) => l.over).length;
  if (s.endedEarly) return done === 1 ? t.game.endedAfterOne : fill(t.game.endedAfter, { n: done });
  return legs.value > 1 && leg.value ? legHow(s, leg.value) : t.modes.names[s.config.mode];
});

function rematch() {
  const config = matches.match?.config;
  if (config) matches.start(rematchConfig(config));
}

const toLobby = () => go(lobby.session ? PATHS.lobby : PATHS.start);
</script>

<template>
  <div v-if="snapshot" class="game">
    <header class="game-top">
      <div class="game-top-side">
        <button type="button" class="btn-quiet btn-icon" :aria-label="t.game.leave" @click="go(lobby.session ? PATHS.lobby : PATHS.setup)">
          <Icon name="back" />
        </button>
        <div id="game-camera-badge" class="game-camera-slot" />
      </div>
      <p class="game-title">{{ title }}</p>
      <div class="game-top-side game-top-tools">
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
      <section ref="playersList" :class="['game-players', { 'game-players-many': many && !cricket }]" :aria-label="t.setup.players">
        <CricketBoard
          v-if="cricket"
          :players="players"
          :state="cricket.state"
          :current="holder ?? current?.playerId ?? null"
          :starts="cricket.starts"
          :legs-won="snapshot.legsWon"
          :legs-to-win="legs"
          :points="cricket.points"
        />
        <template v-else>
          <ModePlayerCard v-for="card in cards" :key="card.id" :card="card" :legs-to-win="legs" :compact="many" />
        </template>
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
          <Keypad v-if="keypad" :disabled="finished" :aim="aim" @hit="(hit) => record(hit)" />
          <Dartboard v-else interactive :darts="boardDarts" :target="aim" :disabled="finished" @hit="record" />
        </div>
      </section>

      <VisitSheet
        v-if="sheetOn"
        :title="legs > 1 ? fill(t.game.visitsTitle, { n: snapshot.legs.length }) : t.game.visitsTab"
        :visits="sheet"
        :picked="correcting"
        :can-mark="canReport"
        @pick="pick"
        @mark="openReport"
        @hide="sheetOn = false"
      />
    </div>

    <button v-if="!sheetOn" type="button" class="sheet-tab" :aria-label="t.game.showVisits" @click="sheetOn = true">
      <Icon name="back" :size="18" />
      <span>{{ t.game.visitsTab }}</span>
    </button>

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

    <ResultCard
      v-if="result && (legCardOn || finished)"
      :title="finished ? matchTitle : legTitle"
      :sub="finished ? matchSub : legSub"
      :players="players"
      :rows="result.rows"
      :caption="finished ? t.history.match : fill(t.game.legCaption, { n: snapshot.legs.length })"
      :bands="[]"
      :lead="null"
      :race="null"
    >
      <template v-if="finished">
        <div class="result-row">
          <button type="button" class="btn-primary btn-lg result-grow" @click="router.push(PATHS.setup)">{{ t.game.newMatch }}</button>
          <button type="button" class="btn-lg" @click="rematch">{{ t.game.rematch }}</button>
          <button type="button" class="btn-quiet btn-lg" @click="toLobby">{{ t.lobby.back }}</button>
        </div>
        <button type="button" class="btn-quiet btn-sm result-back" @click="matches.undo()">
          {{ snapshot.endedEarly ? t.game.playOn : t.game.undoLast }}
        </button>
      </template>
      <template v-else>
        <button type="button" class="btn-primary btn-xl" @click="nextLeg">{{ fill(t.game.nextLeg, { name: nextName }) }}</button>
        <div class="result-row">
          <button type="button" class="result-grow" @click="matches.endMatch()">{{ t.game.endHere }}</button>
          <button type="button" class="btn-quiet" @click="matches.undo()">{{ t.game.undoLast }}</button>
        </div>
      </template>
    </ResultCard>
  </div>
</template>
