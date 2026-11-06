<!--
  The board of targets (issue #22): every number thrown at, painted by its hit
  rate (black for none, yellow for the best number), the others left dark;
  the whole number, or only its double where the double is the target (Bob's
  27). Tapping
  a number picks it: its beds are outlined, and the darts thrown at it are
  drawn where they landed, filled when they counted.
-->
<script setup lang="ts">
import { BOARD, type TargetStat } from '@treblewise/core';
import { computed } from 'vue';

import BoardFace from '../BoardFace.vue';
import { R, buildBeds } from '../dartboardGeometry.js';
import { rampColourAt } from './heatRamp.js';

const props = defineProps<{
  /** The numbered targets (1–20, 25 the bull). */
  targets: readonly TargetStat[];
  picked: number | null;
  label: string;
  /** Which beds a target is: the whole number, or its double. */
  beds?: 'number' | 'double';
}>();
const emit = defineEmits<{ pick: [target: number] }>();

const beds = buildBeds();
const OFF = 'var(--black-800)';

/** The best hit rate: the yellow end of the scale. */
const best = computed(() => Math.max(...props.targets.map((target) => target.percent ?? 0), 1));
const isTargetBed = (key: string) => props.beds !== 'double' || key.startsWith('d-');

/** Every bed painted: a target's by its hit rate against the best, the rest dark. */
const fills = computed(() => {
  const rate = new Map(props.targets.map((target) => [target.target as number, (target.percent ?? 0) / best.value]));
  const paint: Record<string, string> = Object.fromEntries(
    beds.map((bed) => [bed.key, rate.has(bed.sector) && isTargetBed(bed.key) ? rampColourAt(rate.get(bed.sector)!) : OFF]),
  );
  paint.bull = rate.has(25) ? rampColourAt(rate.get(25)!) : OFF;
  return paint;
});

const outline = computed(() => (props.picked === null ? [] : beds.filter((bed) => bed.sector === props.picked)));
const throws = computed(() => props.targets.find((target) => target.target === props.picked)?.throws ?? []);

function pickAt(event: MouseEvent) {
  const sector = (event.target as Element | null)?.closest('[data-sector]')?.getAttribute('data-sector');
  const n = Number(sector);
  if (sector && props.targets.some((target) => target.target === n)) emit('pick', n);
}
</script>

<template>
  <svg class="board-map target-board" :viewBox="`${-R} ${-R} ${2 * R} ${2 * R}`" role="img" :aria-label="label" @click="pickAt">
    <BoardFace :fills="fills" :number-size="17" />
    <g fill="none" stroke="var(--mark-ink)" :stroke-width="2.5" pointer-events="none">
      <path v-for="bed in outline" :key="bed.key" :d="bed.d" />
      <circle v-if="picked === 25" :cx="0" :cy="0" :r="BOARD.outerBullRadius" />
    </g>
    <g pointer-events="none">
      <circle
        v-for="(dart, index) in throws"
        :key="index"
        :cx="dart.pos.x"
        :cy="-dart.pos.y"
        :r="4.5"
        :class="['target-dart', { 'target-dart-hit': dart.hit }]"
      />
    </g>
  </svg>
</template>
