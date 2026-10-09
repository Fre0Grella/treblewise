<!--
  The other half of pairing: pointing a camera at the other device's screen.

  It keeps its own camera rather than sharing the game's, because the two want
  opposite things: the scanner wants the front camera on a laptop and a close
  focus, the scorer wants the back camera pointed at a board across the room.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';

import { useStrings } from '../i18n/index.js';
import { scanFrame } from '../pairing/qr.js';
import { stopCamera } from '../vision/camera.js';

const props = withDefaults(
  defineProps<{
    /** 'user' for a laptop webcam, 'environment' for a phone's back camera. */
    facing?: 'user' | 'environment';
    hint?: string;
  }>(),
  { facing: 'user', hint: undefined },
);

/** The first code that scans. The scanner then stops looking. */
const emit = defineEmits<{ code: [text: string] }>();

const t = useStrings();
const video = ref<HTMLVideoElement | null>(null);
const error = ref<string | null>(null);
const scanning = ref(false);

watch(
  [() => props.facing, video],
  ([facing, element], _, onCleanup) => {
    if (!element) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer = 0;

    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stopCamera(stream);
          return;
        }
        element.srcObject = stream;
        element.playsInline = true;
        element.muted = true;
        await element.play().catch(() => undefined);
        scanning.value = true;

        const look = async () => {
          if (cancelled) return;
          try {
            const code = await scanFrame(element);
            if (code && !cancelled) {
              emit('code', code);
              return; // one code is all we need
            }
          } catch {
            // A frame that fails to decode is the normal case, not an error.
          }
          // Several looks a second: fast enough to feel instant, slow enough to
          // leave the phone's CPU alone.
          timer = window.setTimeout(look, 150);
        };
        void look();
      } catch (cause) {
        if (!cancelled) error.value = cause instanceof Error ? cause.message : String(cause);
      }
    };
    void run();

    onCleanup(() => {
      cancelled = true;
      clearTimeout(timer);
      stopCamera(stream);
      scanning.value = false;
    });
  },
  { immediate: true },
);
</script>

<template>
  <div class="scanner">
    <div class="scanner-frame">
      <!-- A front camera is shown as a mirror, the way every video call shows
           you: moving the phone left then moves it left on screen. Only the
           picture is flipped; the scanner reads the frames as they come, and a
           mirrored QR code would not decode. -->
      <video ref="video" :class="['scanner-video', { 'scanner-video-mirrored': facing === 'user' }]" playsinline muted />
      <div class="scanner-reticle" aria-hidden="true" />
    </div>
    <p class="hint">{{ error ?? hint ?? (scanning ? t.pair.scanning : t.pair.startingCamera) }}</p>
  </div>
</template>
