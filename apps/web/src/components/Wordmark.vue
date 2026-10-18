<!--
  The treblewise wordmark (issue #23): the name, with the t's crossbar raised
  and running on over the word as one bar, the bull for the dot of the i over
  the bar's edge, and the treble ring's beds under the word. Drawn from
  outlines (wordmarkData.ts, written by scripts/build-logo.py), so it needs no
  font. The letters and the bar take the text colour; the bull and the beds
  keep the board's red and green. The ring round the bull is cut out of the
  bar, so whatever is behind shows through.
-->
<script setup lang="ts">
import { useId } from 'vue';

import { useStrings } from '../i18n/index.js';
import { WORDMARK_BULL, WORDMARK_GREEN, WORDMARK_INK, WORDMARK_RED, WORDMARK_VIEWBOX } from './wordmarkData.js';

const t = useStrings();
const bull = WORDMARK_BULL;
const cut = `${useId().replace(/[^a-zA-Z0-9-]/g, '')}-cut`;
</script>

<template>
  <svg class="wordmark" :viewBox="WORDMARK_VIEWBOX" role="img" :aria-label="t.app.name">
    <defs>
      <mask :id="cut">
        <rect width="100%" height="100%" fill="white" />
        <circle :cx="bull.cx" :cy="bull.cy" :r="bull.cut" fill="black" />
      </mask>
    </defs>
    <path class="wordmark-ink" :d="WORDMARK_INK" :mask="`url(#${cut})`" />
    <path class="wordmark-red" :d="WORDMARK_RED" />
    <path class="wordmark-green" :d="WORDMARK_GREEN" />
    <circle class="wordmark-green" :cx="bull.cx" :cy="bull.cy" :r="bull.r" />
    <circle class="wordmark-red" :cx="bull.cx" :cy="bull.cy" :r="bull.core" />
  </svg>
</template>
