<!-- A small dartboard for the mode pictures, with a dart in the treble so it reads as a board in use. -->
<script setup lang="ts">
withDefaults(defineProps<{ x: number; y: number; scale?: number }>(), { scale: 1 });

const RINGS = [26, 20, 13, 6, 2.4];
const SPOKES = [0, 45, 90, 135].map((angle) => {
  const a = (angle * Math.PI) / 180;
  return { angle, x: 26 * Math.cos(a), y: 26 * Math.sin(a) };
});
</script>

<template>
  <g :transform="`translate(${x} ${y}) scale(${scale})`">
    <circle
      v-for="(r, index) in RINGS"
      :key="r"
      :r="r"
      :fill="index === RINGS.length - 1 ? 'currentColor' : 'none'"
      stroke="currentColor"
      :stroke-width="1.4"
      :opacity="index === 0 ? 1 : 0.55"
    />
    <line
      v-for="s in SPOKES"
      :key="s.angle"
      :x1="-s.x"
      :y1="-s.y"
      :x2="s.x"
      :y2="s.y"
      stroke="currentColor"
      :stroke-width="1"
      :opacity="0.4"
    />
    <g transform="translate(6 -16) rotate(35)" stroke="var(--red-400)" :stroke-width="2.2" stroke-linecap="round">
      <line :x1="0" :y1="0" :x2="11" :y2="0" />
      <path d="M11 -3 L16 0 L11 3" fill="none" />
    </g>
  </g>
</template>
