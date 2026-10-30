<!--
  The loading screen while the board is being found: the finder's steps over
  the dimmed photograph, lighting up one after another. It shows that
  something is happening, and what, not an account of it
  (composables/useBoardFinder.ts paces it).
-->
<script setup lang="ts">
import { FINDER_STEPS } from '@treblewise/core';

import { useStrings } from '../i18n/index.js';

defineProps<{
  /** The index in FINDER_STEPS of the newest step lit. */
  shown: number;
}>();

const t = useStrings();
</script>

<template>
  <div class="finder-steps" role="status" :aria-label="t.capture.finding">
    <p class="finder-steps-title">{{ t.capture.finding }}</p>
    <ol>
      <li
        v-for="(step, index) in FINDER_STEPS"
        :key="step"
        :class="{ 'finder-step-done': index < shown, 'finder-step-now': index === shown }"
        :aria-current="index === shown ? 'step' : undefined"
      >
        <span class="finder-step-dot" aria-hidden="true" />{{ t.capture.finderSteps[step] }}
      </li>
    </ol>
  </div>
</template>
