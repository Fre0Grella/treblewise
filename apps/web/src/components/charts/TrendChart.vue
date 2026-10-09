<!--
  One line: how the three-dart average has moved, session by session.

  One series, so no legend: the heading names it. Labels go on the points worth
  naming (the best and the latest) rather than on all of them, and the grid is
  recessive enough to read past.
-->
<script setup lang="ts">
import { computed, useId } from 'vue';

export interface TrendPoint {
  label: string;
  value: number;
  /** Shown under the point when it is labelled. */
  note?: string;
}

const props = withDefaults(
  defineProps<{
    points: TrendPoint[];
    /** Drawn as a dashed line across the chart, e.g. the career average. */
    reference?: { value: number; label: string } | null;
    unit?: string;
  }>(),
  { reference: null, unit: '' },
);

const W = 320;
const H = 130;
const PAD = { left: 30, right: 12, top: 12, bottom: 20 };

const fillId = `fill-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;

const chart = computed(() => {
  const { points, reference } = props;
  const values = points.map((point) => point.value);
  const max = Math.max(...values, reference?.value ?? 0) * 1.08 || 1;
  const x = (index: number) =>
    points.length === 1
      ? PAD.left + (W - PAD.left - PAD.right) / 2
      : PAD.left + (index / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (value: number) => H - PAD.bottom - (value / max) * (H - PAD.top - PAD.bottom);
  const lastIndex = points.length - 1;
  const labelled = new Set([values.indexOf(Math.max(...values)), lastIndex]);
  return {
    x,
    y,
    lastIndex,
    labelled,
    ticks: [0, max / 2, max],
    path: points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(point.value)}`).join(' '),
  };
});
</script>

<template>
  <svg v-if="points.length > 0" class="chart" :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="Average by session">
    <defs>
      <linearGradient :id="fillId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" :stop-opacity="0.22" />
        <stop offset="100%" stop-color="var(--accent)" :stop-opacity="0" />
      </linearGradient>
    </defs>

    <g class="chart-grid">
      <g v-for="tick in chart.ticks" :key="tick">
        <line :x1="PAD.left" :y1="chart.y(tick)" :x2="W - PAD.right" :y2="chart.y(tick)" />
        <text :x="PAD.left - 6" :y="chart.y(tick) + 3" text-anchor="end">{{ Math.round(tick) }}</text>
      </g>
    </g>

    <g v-if="reference" class="chart-reference">
      <line :x1="PAD.left" :y1="chart.y(reference.value)" :x2="W - PAD.right" :y2="chart.y(reference.value)" />
      <text :x="W - PAD.right" :y="chart.y(reference.value) - 4" text-anchor="end">{{ reference.label }}</text>
    </g>

    <path
      :d="`${chart.path} L${chart.x(chart.lastIndex)} ${H - PAD.bottom} L${chart.x(0)} ${H - PAD.bottom} Z`"
      :fill="`url(#${fillId})`"
    />
    <path :d="chart.path" fill="none" stroke="var(--accent)" :stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />

    <template v-for="(point, index) in points" :key="point.label">
      <g v-if="chart.labelled.has(index)">
        <circle :cx="chart.x(index)" :cy="chart.y(point.value)" :r="4.5" fill="var(--bg)" stroke="var(--accent)" :stroke-width="2" />
        <text class="chart-point-label" :x="chart.x(index)" :y="chart.y(point.value) - 9" text-anchor="middle">
          {{ point.value.toFixed(1) }}{{ unit }}
        </text>
      </g>
      <circle v-else :cx="chart.x(index)" :cy="chart.y(point.value)" :r="2" fill="var(--accent)" :opacity="0.65" />
    </template>

    <text class="chart-axis-label" :x="PAD.left" :y="H - 6">{{ points[0]!.label }}</text>
    <text v-if="points.length > 1" class="chart-axis-label" :x="W - PAD.right" :y="H - 6" text-anchor="end">
      {{ points[chart.lastIndex]!.label }}
    </text>
  </svg>
</template>
