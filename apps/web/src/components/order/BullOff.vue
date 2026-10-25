<!--
  Throwing for the bull: one dart each, in turn, tapped onto the board where
  it landed; the closest throws first (game/throwOrder.ts). A tie (two darts
  in the same bull) is thrown again by the tied players only.

  Entered by hand for now: the camera reading these darts is for later.
-->
<script setup lang="ts">
import type { Hit, PlayerConfig, Point } from '@treblewise/core';
import { computed, ref } from 'vue';

import { bullOff, type BullThrow } from '../../game/throwOrder.js';
import { fill, useStrings } from '../../i18n/index.js';
import Dartboard, { type BoardDart } from '../Dartboard.vue';

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
const darts = computed<BoardDart[]>(() => current.value.map((thrown) => ({ id: thrown.id, hit: thrown.hit, pos: thrown.pos })));

const distanceOf = (thrown: BullThrow) =>
  thrown.hit.ring === 'miss'
    ? t.setup.order.bullOff
    : fill(t.setup.order.bullDistance, { mm: Math.round(Math.hypot(thrown.pos.x, thrown.pos.y)) });

function settle() {
  const now = result.value;
  if (now?.kind === 'tie') rounds.value = [...rounds.value, []];
  order.value = decided.value ? decided.value.map((id) => props.players.find((player) => player.id === id)!) : null;
}

function onHit(hit: Hit, pos: Point) {
  const thrower = next.value;
  if (!thrower) return;
  rounds.value = [...rounds.value.slice(0, -1), [...current.value, { id: thrower.id, hit, pos }]];
  settle();
}

/** Takes back the last dart, out of the round before if this one has none yet. */
function undo() {
  const kept = current.value.length > 0 ? rounds.value : rounds.value.slice(0, -1);
  const last = kept[kept.length - 1];
  if (!last || last.length === 0) return;
  rounds.value = [...kept.slice(0, -1), last.slice(0, -1)];
  order.value = null;
}

const canUndo = computed(() => rounds.value.some((round) => round.length > 0));
</script>

<template>
  <div class="bull-off">
    <p v-if="decided" class="bull-off-say" role="status">
      {{ fill(t.setup.order.bullDone, { name: nameOf(decided[0]!) }) }}
    </p>
    <p v-else class="bull-off-say" role="status">
      <template v-if="retrying">{{ fill(t.setup.order.bullAgain, { names: list.format(throwers.map((p) => p.name)) }) }} </template>
      <template v-if="next">{{ fill(t.setup.order.bullTurn, { name: next.name }) }}</template>
    </p>

    <div class="bull-off-board">
      <Dartboard interactive :disabled="decided !== null" :darts="darts" @hit="onHit" />
    </div>

    <ol v-if="current.length > 0" class="lineup bull-off-darts">
      <li v-for="thrown in current" :key="thrown.id" class="row">
        <span class="lineup-name">{{ nameOf(thrown.id) }}</span>
        <span class="num">{{ distanceOf(thrown) }}</span>
      </li>
    </ol>

    <div class="controls">
      <button type="button" class="btn-sm" :disabled="!canUndo" @click="undo">{{ t.setup.order.bullUndo }}</button>
    </div>
  </div>
</template>
