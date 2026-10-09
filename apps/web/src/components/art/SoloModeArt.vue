<!--
  The mode chooser's picture of one device. A sentence explaining "one device"
  versus "two devices" is slower to read than a drawing, so the drawings carry
  the choice and the words confirm it. Red for what points at the board (the
  dart, the camera's lens), green for what flows from it (the view, the score).
-->
<script setup lang="ts">
import ArtBoard from './ArtBoard.vue';
import ArtPhone from './ArtPhone.vue';
import ArtSightline from './ArtSightline.vue';
</script>

<template>
  <svg class="mode-art" viewBox="0 0 200 110" role="img" aria-label="One phone, watching the board and keeping score">
    <ArtBoard :x="48" :y="55" />
    <ArtSightline :from="[136, 55]" :to="[76, 55]" />
    <ArtPhone :x="148" :y="55" :rotate="-8" />
    <text :x="148" :y="104" text-anchor="middle" :font-size="9" fill="currentColor" :opacity="0.65">camera + score</text>
  </svg>
</template>
