<!--
  The connection to the paired phone, as a light (pairing/link.ts): green,
  amber, or red with what to do about it. A bad connection smears the video
  and slows the photographs, and everything that reads the board goes wrong
  with it, so the red says so in words. The numbers the light is judged on
  fold out under it, for whoever wants them.
-->
<script setup lang="ts">
import { computed } from 'vue';

import { fill, useStrings } from '../i18n/index.js';
import { useLobbyStore } from '../store/stores.js';

const t = useStrings();
const lobby = useLobbyStore();

const link = computed(() =>
  lobby.session === 'paired' && lobby.pairing !== null && lobby.pairState === 'connected' ? lobby.link : null,
);
const TONE = { good: 'ok', slow: 'warn', bad: 'bad' } as const;
const label = computed(() => (link.value ? t.camera.link[link.value.health] : ''));
const numbers = computed(() => {
  const readings = link.value?.readings;
  if (!readings) return '';
  const shown = (value: number | undefined) => (value === undefined ? '—' : String(value));
  return fill(t.camera.linkNumbers, {
    kbps: shown(readings.estimateKbps),
    rtt: shown(readings.rttMs),
    fps: shown(readings.fps),
    photo: shown(readings.photoMs),
  });
});
</script>

<template>
  <div v-if="link" class="phone-link">
    <p v-if="link.health === 'bad'" class="warning" role="status">{{ t.camera.linkBad }}</p>
    <details class="fold">
      <summary>
        <span :class="['status', `status-${TONE[link.health]}`]"><span class="status-dot" aria-hidden="true" />{{ label }}</span>
      </summary>
      <p class="phone-link-numbers">{{ numbers }}</p>
    </details>
  </div>
</template>
