<script setup lang="ts">
withDefaults(defineProps<{ x: number; y: number; rotate?: number }>(), { rotate: 0 });
</script>

<template>
  <g :transform="`translate(${x} ${y}) rotate(${rotate})`">
    <rect :x="-13" :y="-24" :width="26" :height="48" :rx="5" fill="var(--bg-sunken)" stroke="currentColor" :stroke-width="1.6" />
    <rect :x="-10" :y="-19" :width="20" :height="34" :rx="2" fill="none" stroke="currentColor" :stroke-width="1" :opacity="0.5" />
    <circle :cy="-21" :r="1.6" fill="var(--red-400)" />
    <line :x1="-4" :y1="19" :x2="4" :y2="19" stroke="currentColor" :stroke-width="1.4" :opacity="0.6" />
  </g>
</template>
