<!-- The camera's field of view, drawn as a soft cone. -->
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ from: [number, number]; to: [number, number] }>();

const d = computed(() => {
  const [x1, y1] = props.from;
  const [x2, y2] = props.to;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = 0.28;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const edge = (offset: number) => [x1 + Math.cos(angle + offset) * length, y1 + Math.sin(angle + offset) * length];
  const [ax, ay] = edge(spread);
  const [bx, by] = edge(-spread);
  return `M${x1} ${y1} L${ax} ${ay} L${bx} ${by} z`;
});
</script>

<template>
  <path :d="d" fill="var(--green-400)" :opacity="0.18" stroke="var(--green-300)" :stroke-width="0.8" stroke-dasharray="3 3" />
</template>
