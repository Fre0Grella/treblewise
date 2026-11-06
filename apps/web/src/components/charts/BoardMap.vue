<!--
  A value drawn over the board: where the darts went, or where they would be
  worth the most.

  The board is under it, faded, with every number round it (BoardFace.vue), so
  a bright patch reads as "the treble 19" rather than "up and to the left".
  The grid is painted into one image (heatRamp.ts), kept inside the board's
  circle so the numbers stay clear, and a thin wireframe goes over it.
-->
<script setup lang="ts">
import { boardWireframe, type BoardGrid, type Point } from '@treblewise/core';
import { computed, useId } from 'vue';

import BoardFace from '../BoardFace.vue';
import { R } from '../dartboardGeometry.js';
import { paintGrid, type RampStyle } from './heatRamp.js';

export interface BoardMarker {
  point: Point;
  label: string;
  kind?: 'best' | 'plain';
}

const props = withDefaults(
  defineProps<{
    grid: BoardGrid;
    /** Values at or below this share of the range are drawn as empty (fading only). */
    floor?: number;
    /** Divides every value; defaults to the grid's own maximum. */
    scale?: number;
    /** `fade` lets the board show where nothing happened; `full` colours it all, black at the lowest. */
    ramp?: RampStyle;
    markers?: BoardMarker[];
    label: string;
  }>(),
  { floor: 0.02, scale: undefined, ramp: 'fade', markers: () => [] },
);

const clip = useId();
const image = computed(() => paintGrid(props.grid, { floor: props.floor, scale: props.scale, style: props.ramp }));
const wires = boardWireframe().map((line) => line.map((point) => `${point.x.toFixed(1)},${(-point.y).toFixed(1)}`).join(' '));
</script>

<template>
  <svg class="board-map" :viewBox="`${-R} ${-R} ${2 * R} ${2 * R}`" role="img" :aria-label="label">
    <defs>
      <clipPath :id="clip">
        <circle :cx="0" :cy="0" :r="grid.half" />
      </clipPath>
    </defs>
    <BoardFace :dim="0.4" :number-size="17" />
    <image
      v-if="image"
      :href="image"
      :x="-grid.half"
      :y="-grid.half"
      :width="grid.half * 2"
      :height="grid.half * 2"
      :clip-path="`url(#${clip})`"
      style="image-rendering: auto"
    />

    <g fill="none" stroke="var(--map-wire)" :stroke-width="0.7" :opacity="0.22">
      <polyline v-for="(points, index) in wires" :key="index" :points="points" />
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
