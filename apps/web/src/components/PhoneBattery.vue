<!--
  The paired phone's battery, where the camera's status is shown: during a game
  and in the camera setup, not only in the lobby. Low and not charging, it
  turns into a warning (see batteryLevel.ts).
-->
<script setup lang="ts">
import { computed } from 'vue';

import { fill, useStrings } from '../i18n/index.js';
import { useLobbyStore } from '../store/stores.js';
import { LOW_BATTERY, shownBattery } from './batteryLevel.js';

const t = useStrings();
const lobby = useLobbyStore();

const live = computed(
  () =>
    lobby.session === 'paired' &&
    lobby.pairing !== null &&
    (lobby.pairState === 'connected' || lobby.pairState === 'connecting'),
);
const battery = computed(() => shownBattery(lobby.phone));
const low = computed(() => battery.value !== undefined && battery.value < LOW_BATTERY && !lobby.phone?.charging);
</script>

<template>
  <template v-if="live && battery !== undefined">
    <p v-if="low" class="warning" role="status">{{ fill(t.camera.batteryLow, { n: battery }) }}</p>
    <span v-else class="phone-battery">
      {{ fill(t.lobby.battery, { n: battery, charging: lobby.phone?.charging ? t.lobby.charging : '' }) }}
    </span>
  </template>
</template>
