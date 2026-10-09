<!--
  The picture of two devices. The same drawing serves the mode chooser and the
  "which device is this?" step after it, because they are the same picture
  answering two questions. With a `focus`, the device you are holding stays lit
  and the other one falls back: the picture then says "this end is you".
-->
<script setup lang="ts">
import { computed } from 'vue';

import ArtBoard from './ArtBoard.vue';
import ArtLaptop from './ArtLaptop.vue';
import ArtPhone from './ArtPhone.vue';
import ArtSightline from './ArtSightline.vue';

const props = defineProps<{ focus?: 'phone' | 'computer' }>();

const label = computed(() =>
  props.focus === 'phone'
    ? 'The phone end: a phone filming the board and sending to a laptop'
    : props.focus === 'computer'
      ? 'The computer end: a laptop keeping score on video from a phone'
      : 'A phone as the camera, sending video to a laptop that keeps score',
);

const dim = (side: 'phone' | 'computer') => (props.focus && props.focus !== side ? 0.3 : 1);
</script>

<template>
  <svg class="mode-art" viewBox="0 0 200 110" role="img" :aria-label="label">
    <g :opacity="dim('phone')">
      <ArtBoard :x="26" :y="52" :scale="0.72" />
      <ArtSightline :from="[72, 52]" :to="[42, 52]" />
      <ArtPhone :x="82" :y="52" :rotate="-8" />
      <text :x="82" :y="94" text-anchor="middle" :font-size="9" fill="currentColor" :opacity="0.65">camera</text>
    </g>

    <!-- Waves: the phone is sending, the laptop is receiving. -->
    <g class="mode-waves" stroke="var(--green-300)" fill="none" stroke-linecap="round" :stroke-width="1.8">
      <path d="M100 52 a10 10 0 0 1 0 -14 a10 10 0 0 1 0 -14" :opacity="0" transform="translate(0 14)" />
      <path class="wave wave-1" d="M100 44 a9 9 0 0 1 0 16" />
      <path class="wave wave-2" d="M107 39 a15 15 0 0 1 0 26" />
      <path class="wave wave-3" d="M114 34 a21 21 0 0 1 0 36" />
    </g>

    <g :opacity="dim('computer')">
      <ArtLaptop :x="158" :y="50" />
      <text :x="158" :y="94" text-anchor="middle" :font-size="9" fill="currentColor" :opacity="0.65">score + vision</text>
    </g>

    <!-- A ring round the end you are holding, for anyone who cannot see the
         difference between 30% and 100% opacity. -->
    <ellipse
      v-if="focus"
      :cx="focus === 'phone' ? 82 : 158"
      :cy="focus === 'phone' ? 50 : 48"
      :rx="focus === 'phone' ? 26 : 46"
      :ry="focus === 'phone' ? 34 : 30"
      fill="none"
      stroke="var(--accent)"
      :stroke-width="1.6"
      stroke-dasharray="4 4"
      :opacity="0.7"
    />
  </svg>
</template>
