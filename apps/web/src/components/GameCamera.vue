<!--
  The camera during a game, and the report.

  With the camera on, every settled throw is photographed and handed to the
  game visit (game/gameVisit.ts), which keeps the visit photo and, with
  "autoscorer scores" on, has it read for a new dart. When a score is wrong,
  the report opens the visit photo and asks the one question worth asking:
  where did the dart actually land? The answer corrects the score *and*
  becomes a labelled training example from exactly the setup and lighting that
  caused the mistake, which is the flywheel docs/03 is built around.
-->
<script setup lang="ts">
import { assessBoardView, boardRegion, formatHit, type Hit, type Point } from '@treblewise/core';
import { computed, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';

import { unlockCaller } from '../caller/caller.js';
import { unlockSounds } from '../caller/sounds.js';
import { raw, useExternal } from '../composables/external.js';
import { useCamera } from '../composables/useCamera.js';
import type { GameVisit } from '../game/gameVisit.js';
import { openReport, saveReport, type OpenedReport } from '../game/report.js';
import { fill, useStrings } from '../i18n/index.js';
import { PATHS } from '../router/paths.js';
import { putFrame, readDart } from '../storage/frames.js';
import { useLobbyStore, useSettingsStore } from '../store/stores.js';
import { cameraSupported, type GrabbedFrame } from '../vision/camera.js';
import { squareAround } from '../vision/crop.js';
import BoardOverlay from './BoardOverlay.vue';
import PhoneBattery from './PhoneBattery.vue';
import PhotoStage from './PhotoStage.vue';
import QualityMarks from './QualityMarks.vue';
import SetupCoach from './SetupCoach.vue';
import Toggle from './ui/Toggle.vue';

const props = defineProps<{
  matchId: string;
  /** The game visit: handed every photograph, and the visit whose darts a report marks. */
  gameVisit: GameVisit;
  /** Someone is to throw: the match is on and not won. */
  canThrow: boolean;
  /** The photograph the game visit's report is open on, or null: the game decides when one opens. */
  report: GrabbedFrame | null;
}>();

const emit = defineEmits<{
  /** "Report" pressed here: the game opens one, if it can be. */
  report: [];
  /** The report is done with, saved or cancelled. */
  closeReport: [];
  correct: [dartId: string, hit: Hit, pos: Point];
}>();

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `frame-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

const t = useStrings();
const router = useRouter();
const settings = useSettingsStore();
const lobby = useLobbyStore();

const visitState = useExternal(props.gameVisit);
const darts = computed(() => visitState.value.visit?.darts ?? []);
const visitComplete = computed(() => visitState.value.visit?.complete === true);
const calibration = computed(() => settings.settings.calibration);
const keepFrames = computed({
  get: () => settings.settings.keepFrames,
  set: (on: boolean) => settings.setKeepFrames(on),
});
const keepPhotos = computed({
  get: () => settings.settings.keepPhotos,
  set: (on: boolean) => settings.setKeepPhotos(on),
});
const autoscore = computed(() => settings.settings.autoscoreGames);
const modelInfo = computed(() => visitState.value.model.manifest);
const modelReady = computed(() => visitState.value.model.status === 'ready');

const latest = shallowRef<GrabbedFrame | null>(null);
/** The report on screen: the photograph it was opened on, its object URL, and its marks. */
const opened = shallowRef<{ photo: GrabbedFrame; url: string } | null>(null);
const report = shallowRef<OpenedReport | null>(null);
const saved = ref<string | null>(null);
// During a game the preview is clutter: the coach line says whether the
// camera is happy, and that is all anyone needs mid-leg. It is one tap away
// when something looks wrong.
const showPreview = ref(false);

// ---- the autoscorer -------------------------------------------------------
// The game visit drives the board watcher; the camera only switches the model
// on and off with the setting, and says what it is doing.
watch(keepFrames, (on) => on && void props.gameVisit.findModel(), { immediate: true });
// Only with frames kept: the camera is off otherwise, and the runtime is not
// worth fetching for nothing.
watch([keepFrames, autoscore], ([on, scoring]) => void props.gameVisit.switchModel(on && scoring), { immediate: true });
watch(
  () => visitState.value.model.status,
  (status) => {
    if (status === 'unavailable') settings.setAutoscoreGames(false); // it cannot run here: say so by switching back off
  },
);

// The capture trigger looks only at the board (see vision/settle.ts).
const region = computed(() => {
  const c = calibration.value;
  return c && c.width > 0 ? boardRegion(c.toImage, { width: c.width, height: c.height }) : null;
});
const reference = computed(() => (calibration.value?.reference ? Uint8Array.from(calibration.value.reference) : null));

const camera = useCamera({
  active: keepFrames,
  onSettle(frame, thumbnail, before) {
    latest.value = raw(frame);
    props.gameVisit.settle(frame, thumbnail, before);
  },
  captureOnSettle: true,
  region,
  reference,
  stream: () => (lobby.mode === 'paired' ? lobby.remoteStream : null),
  grab: () => {
    const pairing = lobby.pairing;
    return lobby.mode === 'paired' && pairing ? () => pairing.requestPhoto() : null;
  },
  // While a report is open nothing is photographed: a new photograph redrew
  // the card under the finger placing a marker, and flickered.
  paused: () => props.report !== null,
});

// A dart entered by hand has no photograph of its own: it was not read, so
// most likely it did not change the picture enough to be photographed (one
// hidden behind another, say). Take one now, so the report shows it.
let newestSeen: string | undefined;
watch(
  () => visitState.value.visit,
  () => {
    const newest = darts.value.at(-1);
    if (!newest || newest.id === newestSeen) return;
    newestSeen = newest.id;
    if (newest.source === 'auto' || !keepFrames.value || !camera.ready.value) return;
    void camera.capture().then((photo) => {
      if (!photo || newestSeen !== newest.id) return;
      latest.value = raw(photo);
      props.gameVisit.photographed(photo);
    });
  },
);

const view = computed(() =>
  calibration.value
    ? assessBoardView(calibration.value.toImage, { width: calibration.value.width, height: calibration.value.height })
    : null,
);

const usable = computed(
  () =>
    calibration.value !== null &&
    latest.value !== null &&
    calibration.value.width === latest.value.width &&
    calibration.value.height === latest.value.height,
);

// The game opens a report on a photograph, which stays fixed for as long as the
// report is open. The darts and the calibration are read as they are then.
watch(
  () => props.report,
  (photo, _, onCleanup) => {
    if (!photo || !calibration.value) return;
    const url = URL.createObjectURL(photo.jpeg);
    opened.value = { photo, url };
    report.value = openReport(darts.value, calibration.value);
    onCleanup(() => URL.revokeObjectURL(url));
  },
);
const shown = computed(() => (props.report !== null && opened.value?.photo === props.report ? props.report : null));

function closeReport() {
  opened.value = null;
  report.value = null;
  emit('closeReport');
}

async function save() {
  const photo = shown.value;
  const marks = report.value;
  if (!photo || !marks || !calibration.value) return;
  const result = saveReport({
    report: marks,
    darts: darts.value,
    photo,
    calibration: calibration.value,
    matchId: props.matchId,
    modelName: modelInfo.value?.name ?? null,
    id: newId(),
    ts: Date.now(),
  });
  // With keeping photos off, a report corrects the score and writes nothing (issue #32).
  const keep = settings.settings.keepPhotos;
  if (result.frame && keep) await putFrame(result.frame);
  for (const correction of result.corrections) emit('correct', correction.dartId, correction.hit, correction.pos);

  const labelled = marks.marks.filter((mark) => mark !== null);
  saved.value = [
    result.corrections.length > 0
      ? fill(t.report.scoreChanged, { score: labelled.map((mark) => formatHit(mark!.hit)).join(' ') })
      : result.frame && keep
        ? t.report.saved
        : '',
    !keep ? t.report.photosOff : result.frame ? '' : t.report.notKept,
  ]
    .filter(Boolean)
    .join(' ');
  setTimeout(() => (saved.value = null), 4000);
  closeReport();
}

function setMark(index: number, mark: ReturnType<typeof readDart> | null) {
  const current = report.value;
  if (!current) return;
  report.value = { ...current, marks: current.marks.map((m, i) => (i === index ? mark : m)) };
}

const visibleMarks = computed(() =>
  (report.value?.marks ?? [])
    .map((mark, index) => ({ mark, index }))
    .filter((entry): entry is { mark: NonNullable<typeof entry.mark>; index: number } => entry.mark !== null),
);

function moveMark(visibleIndex: number, point: Point) {
  const target = visibleMarks.value[visibleIndex]?.index;
  if (target === undefined || !calibration.value) return;
  setMark(target, readDart(calibration.value, point));
}

function tapMark(point: Point) {
  if (!calibration.value || !report.value) return;
  const next = report.value.marks.findIndex((mark) => mark === null);
  if (next >= 0) setMark(next, readDart(calibration.value, point));
}

function toggleAutoscore() {
  unlockCaller();
  unlockSounds();
  settings.setAutoscoreGames(!autoscore.value);
}

const size = computed(() => ({ width: camera.width.value || 1280, height: camera.height.value || 720 }));
const reportCrop = computed(() =>
  shown.value && region.value && calibration.value?.width === shown.value.width ? squareAround(region.value, shown.value) : null,
);
const previewToImage = computed(() =>
  calibration.value && calibration.value.width === camera.width.value && calibration.value.height === camera.height.value
    ? calibration.value.toImage
    : null,
);
const supported = cameraSupported();
const attachVideo = (element: unknown) => {
  camera.video.value = element as HTMLVideoElement | null;
};
</script>

<template>
  <div v-if="supported" class="game-camera">
    <div class="controls">
      <Toggle v-model="keepFrames" :label="keepFrames ? t.report.cameraOn : t.report.cameraOff" />
      <button
        v-if="keepFrames"
        type="button"
        :class="visitComplete && usable && darts.length > 0 ? 'primary' : 'chip'"
        :disabled="!usable || darts.length === 0"
        @click="emit('report')"
      >
        {{ visitComplete ? t.report.markVisit : t.report.button }}
      </button>
      <button v-if="keepFrames" type="button" class="chip" @click="router.push(`${PATHS.camera}?from=game`)">
        {{ calibration ? t.report.cameraSetup : t.capture.calibrate }}
      </button>
      <Toggle v-if="keepFrames && calibration" v-model="showPreview" :label="t.report.preview" />
      <Toggle v-if="keepFrames" v-model="keepPhotos" :label="keepPhotos ? t.capture.keepPhotosOn : t.capture.keepPhotosOff" />
    </div>

    <div v-if="keepFrames && calibration && modelInfo" class="controls">
      <button
        type="button"
        :class="['chip', { 'chip-on': autoscore }]"
        :aria-pressed="autoscore"
        :disabled="!canThrow && !autoscore"
        @click="toggleAutoscore"
      >
        {{ autoscore ? (modelReady ? t.report.autoscoreOn : t.report.autoscoreLoading) : t.report.autoscoreOff }}
      </button>
    </div>
    <p v-if="keepFrames && calibration && modelInfo && autoscore" class="hint">
      {{ visitState.pullingOut ? t.report.autoscorePullOut : visitState.reading ? t.report.autoscoreReading : t.report.autoscoreHelp }}
      {{ fill(t.capture.modelName, { name: modelInfo.name }) }} {{ t.report.autoscoreUnchecked }}
      <template v-if="modelInfo.deepdarts">{{ ` ${t.capture.deepdartsCredit}` }}</template>
      <template v-if="modelInfo.dartscribe">{{ ` ${t.capture.dartscribeCredit}` }}</template>
    </p>

    <p v-if="saved" class="hint">{{ saved }}</p>

    <PhoneBattery v-if="keepFrames" />

    <SetupCoach
      v-if="keepFrames && camera.ready.value"
      :calibrated="calibration !== null"
      :view="view"
      :quality="camera.quality.value"
      :on-show-where="() => (showPreview = true)"
    />

    <div
      v-if="keepFrames"
      :class="['game-camera-preview', { 'game-camera-preview-hidden': !showPreview }]"
      :style="{
        aspectRatio: `${size.width} / ${size.height}`,
        // Cap the height by capping the width instead: clamping the height of
        // an aspect-ratio box squashes the picture.
        maxWidth: `calc(30vh * ${(size.width / size.height).toFixed(4)})`,
      }"
    >
      <video :ref="attachVideo" class="stage-video" playsinline muted />
      <BoardOverlay :width="size.width" :height="size.height" :to-image="previewToImage" />
      <QualityMarks
        :width="size.width"
        :height="size.height"
        :region="region ?? { x: 0, y: 0, width: size.width, height: size.height }"
        :quality="camera.quality.value"
      />
      <div class="stage-badge">
        {{ camera.moving.value ? t.capture.moving : t.capture.waiting }}{{ latest ? ` · ${t.capture.captured}` : '' }}
      </div>
    </div>

    <p v-if="keepFrames && !usable && latest !== null" class="hint">{{ t.capture.noCalibration }}</p>
    <p v-if="keepFrames && latest === null" class="hint">{{ t.report.noFrame }}</p>

    <div v-if="opened && shown && report" class="overlay overlay-report" role="dialog" :aria-label="t.report.title">
      <div class="report">
        <div class="report-side">
          <h2>{{ t.report.title }}</h2>
          <p class="hint">{{ keepPhotos ? t.report.help : t.report.helpNotKept }}</p>

          <div class="chip-row">
            <button v-for="(dart, index) in darts" :key="dart.id" type="button" class="chip" @click="setMark(index, null)">
              {{ index + 1 }}: {{ formatHit(dart.hit) }}{{
                report.marks[index] && report.marks[index]!.hit.value !== dart.hit.value ? ` → ${formatHit(report.marks[index]!.hit)}` : ''
              }}
            </button>
          </div>

          <div class="controls">
            <button type="button" class="primary" @click="save">{{ t.report.save }}</button>
            <button type="button" class="chip" @click="closeReport">{{ t.report.cancel }}</button>
          </div>
        </div>

        <PhotoStage
          class="report-board"
          :url="opened.url"
          :width="shown.width"
          :height="shown.height"
          :crop="reportCrop"
          :to-image="calibration?.toImage ?? null"
          :darts="visibleMarks.map(({ mark, index }) => ({ img: mark.img, label: `${index + 1} · ${formatHit(mark.hit)}` }))"
          :on-dart-move="moveMark"
          :on-tap="tapMark"
        />
      </div>
    </div>
  </div>
</template>
