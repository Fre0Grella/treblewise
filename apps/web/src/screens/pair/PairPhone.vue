<!--
  The phone's side of pairing: be a camera, and nothing else.

  No inference, no scoring, no bright screen. The phone reads the laptop's
  code, starts its back camera, shows its answer for the laptop to read, and
  then sits there sending video with the screen dimmed and the wake lock held.

  The answer goes up as a picture *and* as a hundred characters of text,
  because a desktop computer often has no camera to read a picture with. The
  text can be copied and sent across by any means at hand, or typed.
-->
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import QrCode from '../../components/QrCode.vue';
import QrScanner from '../../components/QrScanner.vue';
import ScreenShell from '../../components/ui/ScreenShell.vue';
import { useStrings } from '../../i18n/index.js';
import { PATHS } from '../../router/paths.js';
import { PairingConnection } from '../../pairing/session.js';
import { formatShortCode } from '../../pairing/shortcode.js';
import { grabJpeg, keepAwake, startCamera, stopCamera } from '../../vision/camera.js';

type Step = 'scan' | 'answer' | 'live' | 'failed';

const t = useStrings();
const router = useRouter();

const step = ref<Step>('scan');
const answer = ref<string | null>(null);
const shortCode = ref<string | null>(null);
const copied = ref<'yes' | 'no' | null>(null);
const error = ref<string | null>(null);
const battery = ref<number | null>(null);
const video = ref<HTMLVideoElement | null>(null);

let connection: PairingConnection | null = null;
let stream: MediaStream | null = null;
let wakeLock: WakeLockSentinel | null = null;

function teardown() {
  connection?.close();
  connection = null;
  stopCamera(stream);
  stream = null;
  void wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}
onBeforeUnmount(teardown);

async function onHubCode(text: string) {
  error.value = null;
  try {
    const media = await startCamera();
    stream = media;

    const joined = await PairingConnection.join(text, media);
    connection = joined.connection;
    // The photographs that get labelled come from here, at the camera's full
    // size, not from the video the laptop sees (see pairing/photo.ts).
    joined.connection.onPhotoRequest = async () => (video.value ? grabJpeg(video.value, 0.92) : null);
    answer.value = joined.code;
    shortCode.value = joined.shortCode;
    step.value = 'answer';

    joined.connection.onState = (state) => {
      if (state === 'connected') step.value = 'live';
      if (state === 'failed') step.value = 'failed';
    };

    const element = video.value;
    if (element) {
      element.srcObject = media;
      element.playsInline = true;
      element.muted = true;
      await element.play().catch(() => undefined);
    }

    wakeLock = await keepAwake();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    step.value = 'failed';
    stopCamera(stream);
    stream = null;
  }
}

// Tell the laptop how the phone is doing, so the hub can warn before the
// battery dies mid-match.
watch(step, (now, _, onCleanup) => {
  if (now !== 'live') return;
  let cancelled = false;
  const report = async () => {
    const withBattery = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> };
    const info = await withBattery.getBattery?.().catch(() => null);
    if (cancelled) return;
    if (info) battery.value = Math.round(info.level * 100);
    const track = stream?.getVideoTracks()[0]?.getSettings();
    connection?.send({
      type: 'status',
      ...(info ? { battery: Math.round(info.level * 100), charging: info.charging } : {}),
      ...(track?.width ? { width: track.width, height: track.height } : {}),
    });
  };
  void report();
  const timer = setInterval(() => void report(), 30_000);
  onCleanup(() => {
    cancelled = true;
    clearInterval(timer);
  });
});

function copy() {
  const code = shortCode.value;
  if (!code) return;
  // Copying is the point: nobody should have to type this if they have any way
  // of sending text to the other machine.
  navigator.clipboard
    ?.writeText(formatShortCode(code))
    .then(() => (copied.value = 'yes'))
    .catch(() => (copied.value = 'no'));
}

function retry() {
  teardown();
  step.value = 'scan';
}

function back() {
  teardown();
  void router.push(PATHS.pair);
}
</script>

<template>
  <ScreenShell
    :class="{ 'screen-dim': step === 'live' }"
    name="camera-role"
    :title="t.camera.title"
    :lead="step === 'live' ? t.camera.liveSubtitle : t.camera.subtitle"
    :back-label="step === 'live' ? t.camera.stop : t.camera.back"
    :on-back="back"
  >
    <QrScanner v-if="step === 'scan'" facing="environment" :hint="t.camera.scanHint" @code="onHubCode" />

    <template v-if="step === 'answer' && answer">
      <p class="pair-instruction">{{ t.camera.showToLaptop }}</p>
      <QrCode :text="answer" :label="t.camera.qrLabel" />
      <p class="hint">{{ t.camera.waiting }}</p>

      <details v-if="shortCode" class="pair-fallback">
        <summary>{{ t.camera.noCameraThere }}</summary>
        <p class="hint">{{ t.camera.codeHelp }}</p>
        <pre class="pair-code">{{ formatShortCode(shortCode) }}</pre>
        <div class="controls">
          <button type="button" class="primary" @click="copy">{{ copied === 'yes' ? t.camera.copied : t.camera.copyCode }}</button>
        </div>
        <p v-if="copied === 'no'" class="warning">{{ t.camera.copyFailed }}</p>
      </details>
    </template>

    <template v-if="step === 'failed'">
      <p class="warning">{{ error ?? t.camera.failed }}</p>
      <div class="controls">
        <button type="button" class="primary" @click="retry">{{ t.camera.retry }}</button>
      </div>
    </template>

    <div :class="step === 'live' ? 'camera-live' : 'camera-live camera-live-hidden'">
      <div class="coach coach-ready">
        <span class="coach-dot" aria-hidden="true" />
        <span class="coach-message">{{ t.camera.connected }}</span>
        <span v-if="battery !== null" class="coach-numbers">{{ t.camera.battery }}: {{ battery }}%</span>
      </div>
      <video ref="video" class="camera-role-preview" playsinline muted />
      <p class="hint">{{ t.camera.keepHere }}</p>
    </div>
  </ScreenShell>
</template>
