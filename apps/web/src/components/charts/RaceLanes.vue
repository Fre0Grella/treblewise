<!--
  A leg of more than two, as a race (two players get the lead instead,
  LeadChart): a lane a player, from the start score on the left to the
  finish, zero, on the right. Each visit is a stretch of the lane as long as
  it scored, coloured as on the player cards (under 60, 60+, 100+, a bust);
  the winner reaches the finish, the others stop where they were left.
  Ordered as they finished: the winner on top, then the closest to zero.

  The names say whose lane it is, so no player needs a colour of their own.
-->
<script setup lang="ts">
import { computed } from 'vue';

import { fill, useStrings } from '../../i18n/index.js';

export interface RaceLane {
  name: string;
  /** The player's visits in order: what each scored, and whether it bust. */
  visits: readonly { score: number; bust: boolean }[];
  /** Points left at the end. */
  left: number;
}

const props = defineProps<{
  /** The leg's start score: the length of every lane. */
  start: number;
  lanes: readonly RaceLane[];
  /** The lane lit: the winner's. */
  lit: number;
}>();

const t = useStrings();

/** A visit worth this share of the lane or more has its score written on it. */
const WRITTEN = 0.1;

// The lit lane first, then the least left; level, in throwing order (the sort is stable).
const order = computed(() =>
  props.lanes.map((lane, index) => ({ lane, index })).sort((a, b) => Number(b.index === props.lit) - Number(a.index === props.lit) || a.lane.left - b.lane.left),
);

const rows = computed(() =>
  order.value.map(({ lane, index }) => ({
    key: `${index}-${lane.name}`,
    name: lane.name,
    left: lane.left,
    on: index === props.lit,
    label: fill(t.game.raceLane, { name: lane.name, visits: lane.visits.map((v) => (v.bust ? t.game.busted : v.score)).join(', '), n: lane.left }),
    visits: lane.visits.map((visit, k) => ({
      kind: visit.bust ? 'bust' : visit.score >= 100 ? 'ton' : visit.score >= 60 ? 'good' : 'low',
      text: !visit.bust && visit.score / props.start >= WRITTEN ? String(visit.score) : '',
      style: visit.bust
        ? { animationDelay: `${200 + k * 70}ms` }
        : { flexBasis: `${(visit.score / props.start) * 100}%`, animationDelay: `${200 + k * 70}ms` },
    })),
  })),
);
</script>

<template>
  <figure class="lanes">
    <div class="lanes-scale" aria-hidden="true">
      <span />
      <span class="lanes-scale-track">
        <span class="num">{{ start }}</span>
        <span class="num">0</span>
      </span>
      <span />
    </div>
    <ol class="lanes-list" :aria-label="fill(t.game.raceLanes, { n: start })">
      <li v-for="row in rows" :key="row.key" :class="['lane', { 'lane-on': row.on }]" :aria-label="row.label">
        <span class="lane-name" aria-hidden="true">{{ row.name }}</span>
        <span class="lane-track" aria-hidden="true">
          <span v-for="(visit, k) in row.visits" :key="k" :class="['lane-visit', `lane-visit-${visit.kind}`]" :style="visit.style">
            {{ visit.text }}
          </span>
        </span>
        <span class="num lane-left" aria-hidden="true">{{ row.on && row.left === 0 ? `✓ ${row.left}` : row.left }}</span>
      </li>
    </ol>
    <figcaption class="lanes-caption">{{ t.game.raceNote }}</figcaption>
  </figure>
</template>
