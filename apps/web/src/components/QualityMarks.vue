<!--
  Where a setup warning points, drawn over the camera picture: the blown-out
  patches behind "a reflection on the board", and the parts that no longer
  match the calibration photograph behind "the camera has moved". The checks
  work on the board's area only (vision/imageStats.ts), so the marks are drawn
  inside it, in the picture's own pixels.
-->
<script setup lang="ts">
import { computed } from 'vue';

import type { Region } from '../vision/camera.js';
import type { ImageQuality } from '../vision/imageStats.js';

const props = defineProps<{
  /** The picture's own size: the SVG's viewBox. */
  width: number;
  height: number;
  /** The board's area in the picture, which the checks looked at. */
  region: Region | null;
  quality: ImageQuality | null;
}>();

const marks = computed(() => {
  const area = props.region;
  const quality = props.quality;
  if (!area || !quality) return { glare: [], changed: [] };
  const place = (spot: { x: number; y: number; width: number; height: number }) => ({
    x: area.x + spot.x * area.width,
    y: area.y + spot.y * area.height,
    width: spot.width * area.width,
    height: spot.height * area.height,
  });
  return { glare: quality.glareSpots.map(place), changed: quality.changedSpots.map(place) };
});
</script>

<template>
  <svg
    v-if="marks.glare.length || marks.changed.length"
    class="quality-marks"
    :viewBox="`0 0 ${width} ${height}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <rect
      v-for="(spot, index) in marks.changed"
      :key="`c${index}`"
      v-bind="spot"
      fill="var(--quality-changed)"
      fill-opacity="0.25"
      stroke="var(--quality-changed)"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
    />
    <rect v-for="(spot, index) in marks.glare" :key="`g${index}`" v-bind="spot" fill="var(--quality-glare)" fill-opacity="0.55" />
  </svg>
</template>
