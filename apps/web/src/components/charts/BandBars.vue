<!--
  How often a visit lands in each band: the shape of a player's scoring, which
  an average alone hides. Two players averaging 60 can be a metronome or a
  180-and-nothing.

  Horizontal bars because the labels are words, and direct labels because there
  are seven of them and a hover tooltip on a phone is a fiction.
-->
<script setup lang="ts">
import { computed } from 'vue';

export interface Band {
  label: string;
  count: number;
  /** Highlighted: the bands worth being proud of. */
  strong?: boolean;
}

const props = defineProps<{ bands: Band[]; total: number }>();

const peak = computed(() => Math.max(1, ...props.bands.map((band) => band.count)));
const share = (count: number) => (props.total === 0 ? 0 : (count / props.total) * 100);
</script>

<template>
  <ul class="bars">
    <li v-for="band in bands" :key="band.label">
      <span class="bars-label">{{ band.label }}</span>
      <span class="bars-track">
        <span :class="['bars-fill', { 'bars-fill-strong': band.strong }]" :style="{ width: `${(band.count / peak) * 100}%` }" />
      </span>
      <span class="bars-value">
        {{ band.count }}
        <small>{{ share(band.count).toFixed(0) }}%</small>
      </span>
    </li>
  </ul>
</template>
