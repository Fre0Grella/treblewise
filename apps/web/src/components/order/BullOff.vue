<!--
  Throwing for the bull: one dart each, in turn, read by the camera or tapped
  onto the board where it landed; the closest throws first
  (game/throwOrder.ts). A tie (two darts in the same bull) is thrown again by
  the tied players only.

  The darts stay in the board until it is decided, as in any bull-off; after
  a tie they come out, and the tied players throw again.

  It is shown as the match's dart card is, close up (BullView.vue): each
  player's card beside it, numbered as their dart is on the board, with how
  far from the middle of the bull it landed.

  The camera is the way it is thrown for: on to begin with whenever the board
  has been found, and shown switched off, saying why, until it has. It reads
  each dart beside the ones already in (game/bullReader.ts); a tap puts a
  misread right.
-->
<script setup lang="ts">
import { formatHit, type Hit, type PlayerConfig, type Point } from '@treblewise/core';
import { computed, ref, watch } from 'vue';

import { raw } from '../../composables/external.js';
import { createBullReader } from '../../game/bullReader.js';
import { bullOff, type BullThrow } from '../../game/throwOrder.js';
import { fill, useStrings } from '../../i18n/index.js';
import { useLobbyStore, useSettingsStore } from '../../store/stores.js';
import { createBoardWatcher } from '../../vision/boardWatcher.js';
import { cameraSupported } from '../../vision/camera.js';
import Icon from '../ui/Icon.vue';
import Switch from '../ui/Switch.vue';
import BullCamera from './BullCamera.vue';
import BullView, { type ViewDart } from './BullView.vue';

const props = defineProps<{ players: PlayerConfig[] }>();
/** Everyone in order once it is decided, the closest first; null until then. */
const order = defineModel<PlayerConfig[] | null>('order', { required: true });

const t = useStrings();
const list = new Intl.ListFormat('en', { type: 'conjunction' });

/** Each round's darts; the last round is the one being thrown. */
const rounds = ref<BullThrow[][]>([[]]);
const current = computed(() => rounds.value[rounds.value.length - 1]!);

/** Who throws in the round being thrown, in the order they were picked. */
const throwers = computed<PlayerConfig[]>(() => {
  if (rounds.value.length === 1) return props.players;
  const before = bullOff(rounds.value.slice(0, -1));
  return before.kind === 'tie' ? props.players.filter((player) => before.tied.includes(player.id)) : [];
});
const result = computed(() => (current.value.length === throwers.value.length ? bullOff(rounds.value) : null));
const decided = computed(() => (result.value?.kind === 'decided' ? result.value.order : null));
const next = computed(() => throwers.value[current.value.length] ?? null);
const retrying = computed(() => rounds.value.length > 1);

const nameOf = (id: string) => props.players.find((player) => player.id === id)?.name ?? '';
const distance = (thrown: BullThrow) => (thrown.hit.ring === 'miss' ? Infinity : Math.hypot(thrown.pos.x, thrown.pos.y));

/** Closest first: once decided, the order; until then, whoever is closest in this round. */
const leader = computed(() => {
  if (decided.value) return decided.value[0]!;
  const best = [...current.value].sort((a, b) => distance(a) - distance(b))[0];
  return best && distance(best) < Infinity ? best.id : null;
});

const darts = computed<ViewDart[]>(() =>
  current.value.map((thrown) => ({
    id: thrown.id,
    number: props.players.findIndex((player) => player.id === thrown.id) + 1,
    hit: thrown.hit,
    pos: thrown.pos,
    leader: thrown.id === leader.value,
  })),
);

/** Whose turn it is, after a tie saying who is in it. */
const say = computed(() => {
  const again = retrying.value ? fill(t.setup.order.bullAgain, { names: list.format(throwers.value.map((p) => p.name)) }) : '';
  const turn = next.value
    ? fill(watching.value ? t.setup.order.bullTurnCamera : t.setup.order.bullTurn, { name: next.value.name })
    : '';
  return [again, turn].filter(Boolean).join(' ');
});

/** Where a dart went in, as a word: the bull by name, any other bed in notation. */
const bedOf = (hit: Hit) =>
  hit.ring === 'bull' ? t.setup.order.bullInBull : hit.ring === 'outerBull' ? t.setup.order.bullInOuter : formatHit(hit);

/** A card per player, in the order they were picked: their dart, or what they are waiting for. */
const cards = computed(() =>
  props.players.map((player, index) => {
    const throwing = throwers.value.some((thrower) => thrower.id === player.id);
    const mine = (round: BullThrow[]) => round.find((thrown) => thrown.id === player.id);
    // Left out of a tie, a player's dart is the one from the round they threw in.
    const thrown = throwing ? mine(current.value) : [...rounds.value].reverse().map(mine).find(Boolean);
    const place = decided.value ? decided.value.indexOf(player.id) : -1;
    let note: string;
    if (thrown) note = thrown.hit.ring === 'miss' ? t.setup.order.bullOff : bedOf(thrown.hit);
    else note = next.value?.id === player.id ? t.setup.order.bullNow : t.setup.order.bullWaiting;
    if (!throwing && !decided.value && thrown) note = t.setup.order.bullOut;
    return {
      player,
      number: index + 1,
      mm: thrown && thrown.hit.ring !== 'miss' ? Math.round(distance(thrown)) : null,
      missed: thrown?.hit.ring === 'miss',
      note,
      place: place === 0 ? t.setup.order.throwsFirst : place > 0 ? t.setup.order.bullPlace(place + 1) : null,
      leader: player.id === leader.value,
      now: !decided.value && next.value?.id === player.id,
      out: !decided.value && !throwing,
    };
  }),
);

/** After a change of darts: a tie starts the next round, and the camera is told what is in the board. */
function settle() {
  const tie = result.value?.kind === 'tie';
  if (tie) rounds.value = [...rounds.value, []];
  reader.holds(current.value.map((thrown) => thrown.pos));
  // Out they come, before the tied players throw again.
  if (tie) reader.roundOver();
  order.value = decided.value ? decided.value.map((id) => props.players.find((player) => player.id === id)!) : null;
}

/** A dart, read by the camera or tapped onto the board. */
function record(hit: Hit, pos: Point) {
  const thrower = next.value;
  if (!thrower) return;
  rounds.value = [...rounds.value.slice(0, -1), [...current.value, { id: thrower.id, hit, pos }]];
  settle();
}

// ---- the camera -------------------------------------------------------------

const settings = useSettingsStore();
const lobby = useLobbyStore();
const calibration = computed(() => settings.settings.calibration);
/** Only on a board that has been found: without it, nothing can be read. */
const cameraPossible = computed(
  () => calibration.value !== null && (cameraSupported() || (lobby.mode === 'paired' && lobby.remoteStream !== null)),
);
const watching = ref(cameraPossible.value);

// A dart per player can be in the board at once: a visit as long as the lineup.
const reader = raw(createBullReader(raw(createBoardWatcher(undefined, { dartsPerVisit: props.players.length })), record));
watch(calibration, (now) => reader.setCalibration(now), { immediate: true });
watch(watching, (on) => void reader.switchModel(on), { immediate: true });
watch(decided, (now) => reader.setActive(now === null), { immediate: true });

/** Takes back the last dart, out of the round before if this one has none yet. */
function undo() {
  const kept = current.value.length > 0 ? rounds.value : rounds.value.slice(0, -1);
  const last = kept[kept.length - 1];
  if (!last || last.length === 0) return;
  rounds.value = [...kept.slice(0, -1), last.slice(0, -1)];
  order.value = null;
  reader.holds(current.value.map((thrown) => thrown.pos));
}

const canUndo = computed(() => rounds.value.some((round) => round.length > 0));
</script>

<template>
  <div class="bull-off">
    <div class="bull-off-side">
      <ol class="bull-players">
        <li
          v-for="card in cards"
          :key="card.player.id"
          :class="['bull-player', { 'bull-player-leader': card.leader, 'bull-player-now': card.now, 'bull-player-out': card.out }]"
        >
          <span class="bull-player-number" aria-hidden="true">{{ card.number }}</span>
          <span class="bull-player-who">
            <span class="bull-player-name">{{ card.player.name }}</span>
            <span class="bull-player-note">{{ card.note }}</span>
          </span>
          <span class="bull-player-end">
            <span v-if="card.place" class="tag tag-on">{{ card.place }}</span>
            <span v-if="card.mm !== null" class="num bull-player-mm">{{ card.mm }}<small> mm</small></span>
            <span v-else-if="card.missed" class="num bull-player-mm">{{ t.setup.order.bullMissShort }}</span>
            <span v-else class="num bull-player-mm bull-player-mm-none" aria-hidden="true">—</span>
          </span>
        </li>
      </ol>

      <Switch
        v-model="watching"
        :label="t.setup.order.cameraSwitch"
        :note="cameraPossible ? t.setup.order.cameraNote : undefined"
        :disabled="!cameraPossible"
      />
      <!-- Outside the switch, which fades when it is off limits: this has to be read. -->
      <p v-if="!cameraPossible" class="hint bull-off-needs">{{ t.setup.order.cameraNeedsBoard }}</p>
      <BullCamera v-if="watching" :reader="reader" />

      <div class="controls">
        <button type="button" class="btn-sm" :disabled="!canUndo" @click="undo">
          <Icon name="undo" :size="18" />{{ t.setup.order.bullUndo }}
        </button>
      </div>
    </div>

    <BullView class="bull-off-view" :darts="darts" :disabled="decided !== null" @hit="record">
      <p v-if="decided" class="bull-off-say" role="status">
        {{ fill(t.setup.order.bullDone, { name: nameOf(decided[0]!) }) }}
        <span class="bull-off-hint">{{ t.setup.order.pullBeforeStart }}</span>
      </p>
      <p v-else class="bull-off-say" role="status">{{ say }}</p>
    </BullView>
  </div>
</template>
