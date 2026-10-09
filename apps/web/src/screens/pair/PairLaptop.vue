<!--
  The laptop's side of pairing: show a code, then read the phone's code back.

  Two codes and no server. The laptop's offer goes out as a picture the phone
  reads; the phone's answer comes back either as a picture the laptop's webcam
  reads, or (for a desktop with no camera) as a hundred characters pasted or
  typed in. After that the video is a direct connection across the network.
-->
<script setup lang="ts">
import { markRaw, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import QrCode from '../../components/QrCode.vue';
import QrScanner from '../../components/QrScanner.vue';
import ScreenShell from '../../components/ui/ScreenShell.vue';
import Segmented from '../../components/ui/Segmented.vue';
import { vFocus } from '../../components/ui/focus.js';
import { useStrings } from '../../i18n/index.js';
import { PATHS } from '../../router/paths.js';
import { PairingConnection } from '../../pairing/session.js';
import { decodeShortCode, shortCodeLength } from '../../pairing/shortcode.js';
import { useLobbyStore } from '../../store/stores.js';

type Step = 'intro' | 'offer' | 'scanning' | 'connecting' | 'connected' | 'failed';

const t = useStrings();
const router = useRouter();
const lobby = useLobbyStore();

const step = ref<Step>(lobby.pairing ? 'connected' : 'intro');
const code = ref<string | null>(null);
const error = ref<string | null>(null);
/** How the phone's answer gets here: read by the webcam, or as text. */
const reading = ref<'scan' | 'code'>('scan');
const readingOptions = [
  { value: 'scan' as const, label: t.pair.useScanner },
  { value: 'code' as const, label: t.pair.useCode },
];
const typed = ref('');
let connection: PairingConnection | null = lobby.pairing;

const enterLobby = () => {
  lobby.enter('paired');
  void router.push(PATHS.lobby);
};

// A computer with no camera cannot scan anything, so it should not be shown a
// scanner first. The kinds are listed before any permission is granted.
onMounted(() => {
  void navigator.mediaDevices
    ?.enumerateDevices()
    .then((devices) => {
      if (!devices.some((device) => device.kind === 'videoinput')) reading.value = 'code';
    })
    .catch(() => undefined);
});

onBeforeUnmount(() => {
  // Leaving mid-handshake should not leave a half-open connection behind. One
  // the store has taken belongs to the lobby and stays alive, whatever state
  // it is in: the phone's video arrives, and the lobby opens, before the
  // connection reports `connected`, and closing it here on the way out is how
  // the lobby came to say "the phone has disconnected" every time.
  if (connection && lobby.pairing !== connection && connection.state !== 'connected') {
    connection.close();
    connection = null;
  }
});

async function start() {
  error.value = null;
  try {
    const hosted = await PairingConnection.host();
    const hosting = markRaw(hosted.connection);
    connection = hosting;
    code.value = hosted.code;
    step.value = 'offer';

    hosting.onStream = (stream) => {
      lobby.setPairing(hosting, markRaw(stream));
      // Paired: the lobby takes it from here, and keeps it.
      enterLobby();
    };
    hosting.onState = (state) => {
      if (state === 'failed') step.value = 'failed';
      if (state === 'connected' && step.value !== 'connected') step.value = 'connecting';
    };
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    step.value = 'failed';
  }
}

async function onPhoneCode(text: string) {
  if (!connection) return;
  step.value = 'connecting';
  try {
    await connection.accept(text);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    step.value = 'failed';
  }
}

function onTyped(text: string) {
  typed.value = text;
  // No submit button: the moment the code is whole and its checksum agrees,
  // there is nothing left to ask.
  try {
    decodeShortCode(text);
  } catch {
    return;
  }
  void onPhoneCode(text);
}

const back = () => (lobby.pairing ? enterLobby() : void router.push(PATHS.pair));
</script>

<template>
  <ScreenShell
    name="pair"
    :title="t.pair.title"
    :lead="t.pair.subtitle"
    :back-label="lobby.pairing ? t.lobby.back : t.pair.back"
    :on-back="back"
  >
    <template v-if="step === 'intro'">
      <ol class="steps">
        <li v-for="line in t.pair.steps" :key="line">{{ line }}</li>
      </ol>
      <div class="controls">
        <button type="button" class="primary" @click="start">{{ t.pair.start }}</button>
      </div>
    </template>

    <template v-if="step === 'offer' && code">
      <p class="pair-instruction">{{ t.pair.showToPhone }}</p>
      <QrCode :text="code" :label="t.pair.qrLabelHub" />
      <div class="controls">
        <button type="button" class="primary" @click="step = 'scanning'">{{ t.pair.scannedIt }}</button>
      </div>
    </template>

    <template v-if="step === 'scanning'">
      <Segmented v-model="reading" :options="readingOptions" :label="t.pair.answerHow" />

      <template v-if="reading === 'scan'">
        <p class="pair-instruction">{{ t.pair.holdUpPhone }}</p>
        <QrScanner facing="user" :hint="t.pair.scanningHint" @code="onPhoneCode" />
      </template>
      <template v-else>
        <p class="pair-instruction">{{ t.pair.typeTheCode }}</p>
        <textarea
          v-focus
          class="pair-code-input"
          rows="6"
          spellcheck="false"
          autocapitalize="characters"
          :aria-label="t.pair.useCode"
          :placeholder="t.pair.codePlaceholder"
          :value="typed"
          @input="onTyped(($event.target as HTMLTextAreaElement).value)"
        />
        <p class="hint">{{ t.pair.codeCounter(shortCodeLength(typed)) }} — {{ t.pair.codeWaiting }}</p>
      </template>

      <div class="controls">
        <button type="button" class="chip" @click="step = 'offer'">{{ t.pair.backToCode }}</button>
      </div>
    </template>

    <p v-if="step === 'connecting'" class="pair-instruction">{{ t.pair.connecting }}</p>

    <template v-if="step === 'connected'">
      <div class="coach coach-ready">
        <span class="coach-dot" aria-hidden="true" />
        <span class="coach-message">{{ t.pair.connected }}</span>
      </div>
      <div class="controls">
        <button type="button" class="primary" @click="enterLobby">{{ t.lobby.back }}</button>
      </div>
    </template>

    <template v-if="step === 'failed'">
      <p class="warning">{{ error ?? t.pair.failed }}</p>
      <div class="controls">
        <button type="button" class="primary" @click="start">{{ t.pair.retry }}</button>
      </div>
    </template>
  </ScreenShell>
</template>
