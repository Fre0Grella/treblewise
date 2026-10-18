<!--
  A leg or a match just won (issue #18), over the dimmed match screen. On
  the left the title, how it was won, who was ahead through the leg and what
  to do next (the buttons are the slot's); on the right the numbers side by
  side and the visits by score, one side per player.
-->
<script setup lang="ts">
import { computed } from 'vue';

import { useStrings } from '../i18n/index.js';
import LeadChart, { type LeadPoint } from './charts/LeadChart.vue';
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
  bands: readonly ScoreBand[];
  /** Who was ahead, for two players. */
  lead: { points: readonly LeadPoint[]; won: boolean } | null;
}>();

const t = useStrings();

const pair = computed(() => (props.players.length === 2 ? ([props.players[0]!.name, props.players[1]!.name] as const) : null));
const peak = computed(() => Math.max(1, ...props.bands.flatMap((band) => band.counts)));
// A share of its side, so the bands fit a phone too.
const bar = (n: number, k: number) => ({ width: n ? `max(6px, ${(n / peak.value) * 80}%)` : '0', animationDelay: `${300 + k * 60}ms` });
</script>

<template>
  <div class="overlay">
    <div class="result" role="dialog" :aria-label="title">
      <div class="result-main">
        <div>
          <h2 class="result-title">{{ title }}</h2>
          <p class="result-sub">{{ sub }}</p>
        </div>
        <LeadChart v-if="pair && lead && lead.points.length > 0" :names="pair" :points="lead.points" :won="lead.won" />
        <div class="result-actions">
          <slot />
        </div>
      </div>

      <div class="result-side">
        <HeadToHead :players="players" :rows="rows" :caption="caption" />
        <template v-if="pair">
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
