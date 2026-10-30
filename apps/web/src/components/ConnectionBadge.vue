<!--
  The connection to the paired phone, in the match's top bar: a signal icon
  in green, amber or red (pairing/link.ts), and a chevron that opens the
  numbers behind it. No words on the badge: the icon says what it is, and its
  name says it aloud. When the connection is bad, or the phone has dropped
  out, it offers to pair again, as the lobby does. Nothing on a single device.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import Icon from './ui/Icon.vue';
import { fill, useStrings } from '../i18n/index.js';
import type { LinkHealth } from '../pairing/link.js';
import { PATHS } from '../router/paths.js';
import { useLobbyStore } from '../store/stores.js';

const t = useStrings();
const router = useRouter();
const lobby = useLobbyStore();
const open = ref(false);

/** How the connection is: from the link's readings, or bad when the phone has dropped out. */
const health = computed<LinkHealth | null>(() => {
  if (lobby.session !== 'paired') return null;
  if (lobby.pairing === null || (lobby.pairState !== 'connected' && lobby.pairState !== 'connecting')) return 'bad';
  if (lobby.pairState === 'connecting') return 'slow';
  return lobby.link?.health ?? 'good';
});
const dropped = computed(() => health.value === 'bad' && lobby.pairState !== 'connected');
const TONE = { good: 'ok', slow: 'warn', bad: 'bad' } as const;
const label = computed(() => (health.value ? (dropped.value ? t.camera.linkDropped : t.camera.link[health.value]) : ''));
const numbers = computed(() => {
  const readings = lobby.link?.readings;
  if (!readings || dropped.value) return '';
  const shown = (value: number | undefined) => (value === undefined ? '—' : String(value));
  return fill(t.camera.linkNumbers, {
    kbps: shown(readings.estimateKbps),
    rtt: shown(readings.rttMs),
    fps: shown(readings.fps),
    photo: shown(readings.photoMs),
  });
});

function pairAgain() {
  open.value = false;
  lobby.clearPairing();
  void router.push(PATHS.pairLaptop);
}
</script>

<template>
  <span v-if="health" class="connection-badge">
    <button
      type="button"
      :class="['status', 'status-btn', 'status-icon', `status-${TONE[health]}`]"
      :aria-label="label"
      :aria-expanded="open"
      :title="label"
      @click="open = !open"
    >
      <Icon name="signal" :size="18" />
      <Icon :name="open ? 'chevron-up' : 'chevron-down'" :size="14" />
    </button>
    <button v-if="health === 'bad'" type="button" class="btn-primary btn-sm" @click="pairAgain">{{ t.lobby.pairAgain }}</button>
    <template v-if="open">
      <div class="popover-scrim" @click="open = false" />
      <div class="popover popover-link" role="dialog" :aria-label="label">
        <span class="label">{{ label }}</span>
        <p v-if="health === 'bad'" class="hint">{{ dropped ? t.camera.linkDroppedHelp : t.camera.linkBad }}</p>
        <p v-if="numbers" class="phone-link-numbers">{{ numbers }}</p>
      </div>
    </template>
  </span>
</template>
