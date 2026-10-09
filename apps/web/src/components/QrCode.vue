<!--
  A pairing code, drawn big.

  White on black would be prettier next to the rest of the app, and would also
  stop half the QR readers in the world working: the quiet zone and the
  light-on-dark convention are part of the format, not decoration.
-->
<script setup lang="ts">
import { computed } from 'vue';

import { qrMatrix, qrPath } from '../pairing/qr.js';

const props = defineProps<{
  text: string;
  /** Alt text, because a QR is an image with meaning. */
  label: string;
}>();

const QUIET_ZONE = 4;

const code = computed(() => {
  const matrix = qrMatrix(props.text);
  return { path: qrPath(matrix), extent: matrix.size + QUIET_ZONE * 2 };
});
</script>

<template>
  <svg class="qr" :viewBox="`0 0 ${code.extent} ${code.extent}`" role="img" :aria-label="label" shape-rendering="crispEdges">
    <rect :width="code.extent" :height="code.extent" fill="var(--qr-paper)" />
    <g :transform="`translate(${QUIET_ZONE} ${QUIET_ZONE})`">
      <path :d="code.path" fill="var(--qr-ink)" />
    </g>
  </svg>
</template>
