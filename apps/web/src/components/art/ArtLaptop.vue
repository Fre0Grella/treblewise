<script setup lang="ts">
defineProps<{ x: number; y: number }>();
</script>

<template>
  <g :transform="`translate(${x} ${y})`">
    <rect :x="-26" :y="-20" :width="52" :height="34" :rx="3" fill="var(--bg-sunken)" stroke="currentColor" :stroke-width="1.6" />
    <rect :x="-21" :y="-15" :width="42" :height="24" :rx="1.5" fill="none" stroke="currentColor" :stroke-width="1" :opacity="0.45" />
    <path d="M-34 14 H34 l4 5 H-38 z" fill="var(--bg-sunken)" stroke="currentColor" :stroke-width="1.6" stroke-linejoin="round" />
    <!-- A score on the screen: this is the device doing the thinking. -->
    <text :x="0" :y="2" text-anchor="middle" :font-size="13" font-weight="700" fill="var(--green-300)">501</text>
  </g>
</template>
