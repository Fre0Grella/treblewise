<!--
  The treblewise wordmark (issue #23): the name, with the t's crossbar raised
  and running on over the word as the treble ring's beds, and the bull for the
  dot of the i. Drawn from outlines (wordmarkData.ts, written by
  scripts/build-logo.py), so it needs no font. The letters take the text
  colour; the beds keep the board's red and green.
-->
<script setup lang="ts">
import { useStrings } from '../i18n/index.js';
import { WORDMARK_BULL, WORDMARK_GREEN, WORDMARK_INK, WORDMARK_RED, WORDMARK_VIEWBOX } from './wordmarkData.js';

const t = useStrings();
const bull = WORDMARK_BULL;
</script>

<template>
  <svg class="wordmark" :viewBox="WORDMARK_VIEWBOX" role="img" :aria-label="t.app.name">
    <path class="wordmark-ink" :d="WORDMARK_INK" />
    <path class="wordmark-red" :d="WORDMARK_RED" />
    <path class="wordmark-green" :d="WORDMARK_GREEN" />
    <circle class="wordmark-green" :cx="bull.cx" :cy="bull.cy" :r="bull.r" />
    <circle class="wordmark-red" :cx="bull.cx" :cy="bull.cy" :r="bull.r / 2" />
  </svg>
</template>
