<!--
  A game other than X01 on the statistics screen (issue #22), measured on its
  own terms (core stats/modes.ts), never in the X01 averages.

  The numbers that matter in the game, big; then, in the games with a target,
  number by number: the board painted by hit rate, a number picked on it or in
  the list showing where its darts went; in cricket, the marks by number; and
  the last games, oldest first.
-->
<script setup lang="ts">
import { CRICKET_NUMBERS, RESULT_UNIT, type ModeStats } from '@treblewise/core';
import { computed, ref, watch } from 'vue';

import { modeTiles, targetLabel } from '../game/modeStatsView.js';
import { fill, useStrings } from '../i18n/index.js';
import BandBars from './charts/BandBars.vue';
import PercentBars from './charts/PercentBars.vue';
import StatTile from './charts/StatTile.vue';
import TargetBoard from './charts/TargetBoard.vue';
import { rampStops } from './charts/heatRamp.js';

const props = defineProps<{ stats: ModeStats }>();

const t = useStrings();
const tiles = computed(() => modeTiles(props.stats));

const bars = computed(() =>
  props.stats.targets.map((target) => ({
    key: String(target.target),
    label: targetLabel(target.target, props.stats.mode),
    percent: target.percent,
    hits: target.hits,
    darts: target.darts,
  })),
);
/** The numbered targets, which can go on the board (any double or treble cannot). */
const onBoard = computed(() => props.stats.targets.filter((target) => typeof target.target === 'number'));

const picked = ref<number | null>(null);
// A new game or player: the busiest number is picked to start with.
watch(
  onBoard,
  (targets) => {
    if (picked.value !== null && targets.some((target) => target.target === picked.value)) return;
    picked.value = (([...targets].sort((a, b) => b.darts - a.darts)[0]?.target as number | undefined) ?? null);
  },
  { immediate: true },
);
/** The board's scale: black for none, yellow for the best number. */
const bestRate = computed(() => Math.max(...onBoard.value.map((target) => target.percent ?? 0), 0));
const scale = `linear-gradient(90deg, ${rampStops('full', false)})`;
const pickedStat = computed(() => props.stats.targets.find((target) => target.target === picked.value) ?? null);
const pick = (key: string) => {
  const n = Number(key);
  if (!Number.isNaN(n)) picked.value = n;
};

const marks = computed(() =>
  CRICKET_NUMBERS.map((n) => ({ label: n === 25 ? t.stats.bull : String(n), count: props.stats.marks[n] ?? 0, strong: n === 20 })),
);
const marksTotal = computed(() => marks.value.reduce((sum, band) => sum + band.count, 0));

const unit = computed(() => RESULT_UNIT[props.stats.mode].unit);
const lastGames = computed(() =>
  props.stats.results.slice(-10).map((result, index) => ({
    key: index,
    won: result.won,
    text: result.value === null ? '—' : unit.value === 'mpr' ? result.value.toFixed(2) : String(Math.round(result.value)),
  })),
);
</script>

<template>
  <p v-if="stats.legs === 0 && stats.darts === 0" class="empty-note">{{ t.stats.modeEmpty }}</p>
  <template v-else>
    <section class="stats-scoring" :aria-label="t.stats.scoring">
      <div class="tiles">
        <StatTile v-for="tile in tiles" :key="tile.label" :label="tile.label" :value="tile.value" :note="tile.note" />
      </div>
    </section>

    <div class="stats-grid">
      <section v-if="stats.targets.length > 0" class="panel stats-wide stats-board-row">
        <div class="stats-board">
          <h2>{{ t.stats.byTarget }}</h2>
          <template v-if="onBoard.length > 0">
            <TargetBoard
              :targets="onBoard"
              :picked="picked"
              :label="t.stats.targetBoard"
              :beds="stats.mode === 'bobs27' ? 'double' : 'number'"
              @pick="(n) => (picked = n)"
            />
            <div class="legend">
              <span>0%</span>
              <span class="legend-ramp" :style="{ background: scale }" />
              <span>{{ Math.round(bestRate) }}%</span>
            </div>
          </template>
        </div>
        <div class="stats-board-side">
          <p v-if="pickedStat" class="stat-sentence">
            {{
              fill(t.stats.targetDetail, {
                target: targetLabel(pickedStat.target, stats.mode),
                percent: Math.round(pickedStat.percent ?? 0),
                hits: pickedStat.hits,
                darts: pickedStat.darts,
              })
            }}
            <template v-if="pickedStat.hits > 0"> · {{ fill(t.stats.targetPerHit, { n: (pickedStat.darts / pickedStat.hits).toFixed(1) }) }}</template>
          </p>
          <p v-else class="hint">{{ t.stats.targetPick }}</p>
          <p v-if="pickedStat && pickedStat.throws.length === 0" class="hint">{{ t.stats.targetNoPositions }}</p>
          <PercentBars :bars="bars" selectable :picked="picked === null ? null : String(picked)" @pick="pick" />
          <p class="hint">{{ t.stats.byTargetNote }}</p>
        </div>
      </section>

      <section v-if="stats.mode === 'cricket'" class="panel">
        <h2>{{ t.stats.marksByNumber }}</h2>
        <BandBars :bands="marks" :total="marksTotal" />
      </section>

      <section v-if="lastGames.length > 0" class="panel">
        <h2>{{ t.stats.lastGames }}</h2>
        <ol class="last-games">
          <li v-for="game in lastGames" :key="game.key" :class="['num', 'last-game', { 'last-game-won': game.won }]">{{ game.text }}</li>
        </ol>
      </section>
    </div>
  </template>
</template>
