<!--
  A leg or a match just won (issue #18), over the dimmed match screen. On
  the left the title, how it was won, how the leg went (for two players who
  was ahead, for more a race, a lane each) and what to do next (the buttons
  are the slot's); on the right the numbers side by side and the visits by
  score, one side per player. With more than two players both go in
  columns, a player each, the bands under the numbers; from four players on
  the bands are counts alone, so the columns fit.
-->
<script setup lang="ts">
import { computed } from 'vue';

import { useStrings } from '../i18n/index.js';
import LeadChart, { type LeadPoint } from './charts/LeadChart.vue';
import RaceLanes, { type RaceLane } from './charts/RaceLanes.vue';
import HeadToHead, { type HeadToHeadRow } from './HeadToHead.vue';

export interface ScoreBand {
  label: string;
  /** Visits in the band, one per player. */
  counts: readonly number[];
}

const props = defineProps<{
  title: string;
  sub: string;
  players: readonly { id: string; name: string }[];
  rows: readonly HeadToHeadRow[];
  /** Between the two names: "Leg 3", "Match". */
  caption: string;
  /** The visits by score; none in a game that is not X01. */
  bands: readonly ScoreBand[];
  /** Who was ahead, for two players. */
  lead: { points: readonly LeadPoint[]; won: boolean } | null;
  /** What each had left, for more than two players. */
  race: { start: number; lanes: readonly RaceLane[]; lit: number } | null;
}>();

const t = useStrings();

const pair = computed(() => (props.players.length === 2 ? ([props.players[0]!.name, props.players[1]!.name] as const) : null));
const peak = computed(() => Math.max(1, ...props.bands.flatMap((band) => band.counts)));
// A share of its side, so the bands fit a phone too.
const bar = (n: number, k: number) => ({ width: n ? `max(6px, ${(n / peak.value) * 80}%)` : '0', animationDelay: `${300 + k * 60}ms` });
const bandBars = computed(() => props.players.length < 4);
// In a player's column, beside the count.
const cellBar = (n: number, k: number) => ({ width: n ? `${6 + (n / peak.value) * 38}px` : '0', animationDelay: `${300 + k * 60}ms` });
</script>

<template>
  <div class="overlay">
    <div :class="['result', { 'result-columns': !pair }]" role="dialog" :aria-label="title">
      <div class="result-main">
        <div>
          <h2 class="result-title">{{ title }}</h2>
          <p class="result-sub">{{ sub }}</p>
        </div>
        <LeadChart v-if="pair && lead && lead.points.length > 0" :names="pair" :points="lead.points" :won="lead.won" />
        <RaceLanes v-else-if="race && race.lanes.some((lane) => lane.visits.length > 0)" :start="race.start" :lanes="race.lanes" :lit="race.lit" />
        <div class="result-actions">
          <slot />
        </div>
      </div>

      <div class="result-side">
        <HeadToHead :players="players" :rows="rows" :caption="caption">
          <template v-if="!pair && bands.length > 0" #rows>
            <tr class="result-bands-head">
              <th :colspan="players.length + 1">{{ t.game.visitsByScore }}</th>
            </tr>
            <tr v-for="(band, k) in bands" :key="band.label" class="result-bands-row">
              <th scope="row">{{ band.label }}</th>
              <td v-for="(n, index) in band.counts" :key="index">
                <span class="result-band-cell">
                  <span v-if="bandBars" class="result-band-bar result-band-a" :style="cellBar(n, k)" />
                  <span :class="['num', { 'result-band-none': !n }]">{{ n }}</span>
                </span>
              </td>
            </tr>
          </template>
        </HeadToHead>
        <template v-if="pair && bands.length > 0">
          <span class="result-bands-title">{{ t.game.visitsByScore }}</span>
          <ul class="result-bands">
            <li v-for="(band, k) in bands" :key="band.label">
              <span class="result-band-side">
                <span :class="['num', { 'result-band-none': !band.counts[0] }]">{{ band.counts[0] }}</span>
                <span class="result-band-bar result-band-a" :style="bar(band.counts[0] ?? 0, k)" />
              </span>
              <span class="result-band-label">{{ band.label }}</span>
              <span class="result-band-side">
                <span class="result-band-bar result-band-b" :style="bar(band.counts[1] ?? 0, k)" />
                <span :class="['num', { 'result-band-none': !band.counts[1] }]">{{ band.counts[1] }}</span>
              </span>
            </li>
          </ul>
        </template>
      </div>
    </div>
  </div>
</template>
