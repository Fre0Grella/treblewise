<!--
  A value drawn over the board: where the darts went, or where they would be
  worth the most.

  The grid is painted into one image (heatRamp.ts). The board's wires go on top
  as a thin wireframe so a bright patch can be read as "the treble 19" rather
  than "up and to the left".
-->
<script setup lang="ts">
import { BOARD, boardWireframe, type BoardGrid, type Point } from '@treblewise/core';
import { computed } from 'vue';

import { paintGrid } from './heatRamp.js';

export interface BoardMarker {
  point: Point;
  label: string;
  kind?: 'best' | 'plain';
}

const props = withDefaults(
  defineProps<{
    grid: BoardGrid;
    /** Values at or below this are drawn as empty. */
    floor?: number;
    /** Divides every value; defaults to the grid's own maximum. */
    scale?: number;
    markers?: BoardMarker[];
    label: string;
  }>(),
  { floor: 0.02, scale: undefined, markers: () => [] },
);

const R = BOARD.boardRadius;

const image = computed(() => paintGrid(props.grid, props.floor, props.scale));

const wires = boardWireframe().map((line) => line.map((point) => `${point.x.toFixed(1)},${(-point.y).toFixed(1)}`).join(' '));

const numbers = [20, 6, 3, 11].map((sector, index) => {
  const angle = ([90, 0, 270, 180][index]! * Math.PI) / 180;
  const r = (BOARD.doubleOuterRadius + R) / 2;
  return { sector, x: r * Math.cos(angle), y: -r * Math.sin(angle) + 5 };
});
</script>

<template>
  <svg class="board-map" :viewBox="`${-R} ${-R} ${2 * R} ${2 * R}`" role="img" :aria-label="label">
    <circle :cx="0" :cy="0" :r="R" fill="var(--board-backdrop)" />
    <image
      v-if="image"
      :href="image"
      :x="-grid.half"
      :y="-grid.half"
      :width="grid.half * 2"
      :height="grid.half * 2"
      style="image-rendering: auto"
    />

    <g fill="none" stroke="var(--map-wire)" :stroke-width="0.7" :opacity="0.22">
      <polyline v-for="(points, index) in wires" :key="index" :points="points" />
    </g>

    <g fill="var(--map-number)" :font-size="15" text-anchor="middle" :opacity="0.7">
      <text v-for="n in numbers" :key="n.sector" :x="n.x" :y="n.y">{{ n.sector }}</text>
    </g>

    <g v-for="marker in markers" :key="marker.label">
      <circle
        :cx="marker.point.x"
        :cy="-marker.point.y"
        :r="marker.kind === 'best' ? 13 : 9"
        fill="none"
        stroke="var(--mark-ink)"
        :stroke-width="marker.kind === 'best' ? 3 : 2"
      />
      <text
        :x="marker.point.x"
        :y="-marker.point.y - 19"
        fill="var(--mark-ink)"
        :font-size="17"
        font-weight="700"
        text-anchor="middle"
        paint-order="stroke"
        stroke="var(--mark-shade-strong)"
        :stroke-width="4"
      >
        {{ marker.label }}
      </text>
    </g>
  </svg>
</template>
