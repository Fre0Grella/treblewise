<!--
  What finding the board came to, in the calibrate step: a light that says
  whether the found board fits the wires, or where to look, with the numbers
  it is judged on folded under it, as the phone link light does. When the
  board was not found, why, and that the markers are the person's to place.
-->
<script setup lang="ts">
import { computed } from 'vue';

import { fill, useStrings } from '../i18n/index.js';
import type { FinderResult } from '../vision/findBoard.js';

const props = defineProps<{
  result: FinderResult;
  /** A marker has been dragged since: the light is about the board as found, not as it is now. */
  adjusted: boolean;
}>();

const t = useStrings();

const found = computed(() => ('notFound' in props.result ? null : props.result));
const label = computed(() => {
  const fit = found.value?.fit;
  if (!fit) return '';
  if (props.adjusted) return t.capture.fitAdjusted;
  return fit.worstSector === null ? t.capture.fitGood : fill(t.capture.fitCheck, { sector: fit.worstSector });
});
const numbers = computed(() => {
  const fit = found.value?.fit;
  return fit
    ? fill(t.capture.fitNumbers, {
        edges: fit.ringFeatures,
        wires: fit.wireFeatures,
        median: fit.medianMm.toFixed(1),
        p90: fit.p90Mm.toFixed(1),
      })
    : '';
});
</script>

<template>
  <p v-if="'notFound' in result" class="warning" role="status">{{ t.capture.notFound[result.notFound] }}</p>
  <details v-else class="fold board-fit">
    <summary>
      <span :class="['status', !adjusted && found?.fit.worstSector !== null ? 'status-warn' : 'status-ok']">
        <span class="status-dot" aria-hidden="true" />{{ label }}
      </span>
    </summary>
    <p class="board-fit-numbers">{{ numbers }}</p>
  </details>
</template>
