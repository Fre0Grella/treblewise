<!--
  The camera watching the darts thrown for the bull: the same camera as in a
  game (this tab's, or the paired phone's), handing each settled photograph to
  the bull reader (game/bullReader.ts), with a small picture of the board and
  one line saying what it is waiting for.
-->
<script setup lang="ts">
import { boardRegion } from '@treblewise/core';
import { computed } from 'vue';

import { useExternal } from '../../composables/external.js';
import { useCamera } from '../../composables/useCamera.js';
import { useExposure } from '../../composables/useExposure.js';
import type { BullReader } from '../../game/bullReader.js';
import { useStrings } from '../../i18n/index.js';
import { useLobbyStore, useSettingsStore } from '../../store/stores.js';
import { referenceOf } from '../../vision/imageStats.js';

const props = defineProps<{ reader: BullReader }>();

const t = useStrings();
const settings = useSettingsStore();
const lobby = useLobbyStore();
const state = useExternal(props.reader);

const calibration = computed(() => settings.settings.calibration);
const region = computed(() => {
  const c = calibration.value;
  return c && c.width > 0 ? boardRegion(c.toImage, { width: c.width, height: c.height }) : null;
});

const camera = useCamera({
  active: true,
  onSettle: (photo, thumbnail, before) => props.reader.settle(photo, thumbnail, before),
  onStill: (thumbnail) => props.reader.still(thumbnail),
  captureOnSettle: true,
  region,
  reference: () => referenceOf(calibration.value),
  stream: () => (lobby.mode === 'paired' ? lobby.remoteStream : null),
  grab: () => {
    const pairing = lobby.pairing;
    return lobby.mode === 'paired' && pairing ? () => pairing.requestPhoto() : null;
  },
  exposure: () => settings.settings.exposure,
});
useExposure(camera);

const attachVideo = (element: unknown) => {
  camera.video.value = element as HTMLVideoElement | null;
};

/** What the camera is doing, in a line. */
const said = computed(() => {
  const status = state.value.model.status;
  if (camera.error.value) return camera.error.value;
  if (status === 'loading' || status === 'off') return t.setup.order.cameraLoading;
  if (status === 'none' || status === 'unavailable') return t.setup.order.cameraUnavailable;
  if (!camera.ready.value) return t.setup.order.cameraStarting;
  switch (state.value.phase) {
    case 'reading':
      return t.setup.order.cameraReading;
    case 'pull-out':
      return t.setup.order.cameraPullOut;
    case 'off':
      return '';
    default:
      return camera.moving.value ? t.setup.order.cameraMoving : t.setup.order.cameraWaiting;
  }
});
</script>

<template>
  <div class="bull-camera">
    <video :ref="attachVideo" class="bull-camera-video" playsinline muted />
    <div class="bull-camera-side">
      <p class="bull-camera-said" role="status">{{ said }}</p>
      <button v-if="state.phase === 'pull-out'" type="button" class="btn-sm" @click="reader.dartsOut()">
        {{ t.setup.order.dartsOut }}
      </button>
    </div>
  </div>
</template>
