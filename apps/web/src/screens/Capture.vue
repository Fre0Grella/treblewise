<!--
  Camera setup, and the practice round that proves it works.

  Three steps, once: point the camera, find the board, then **try it**. Try-it
  is the heart of this screen. You throw a dart, the app photographs the board
  the moment it settles, you tap the dart in the picture, and it calls the score
  back at you. That single loop does three jobs at once:

   - it shows you whether the camera is set up properly, because a wrong
     calibration gives a wrong score and you will hear it;
   - it is the least tedious way anyone has found to label training data,
     since a dart you have just thrown is a dart you can still see; and
   - one throw is one labelled sample, so the count going up is the training
     set being built.

  The darts are not pulled between throws, because a model has to learn the
  second and third dart of a visit with the first ones in the way. That loop is
  the marking session (capture/markingSession.ts); this screen sets up the
  camera, calibrates, and renders the session.
-->
<script setup lang="ts">
import { CALIBRATION_BOARD_POINTS, assessBoardView, boardRegion, formatHit, type Point } from '@treblewise/core';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { unlockCaller } from '../caller/caller.js';
import BoardOverlay, { type OverlayHandle } from '../components/BoardOverlay.vue';
import PhoneBattery from '../components/PhoneBattery.vue';
import SetupCoach from '../components/SetupCoach.vue';
import Fold from '../components/ui/Fold.vue';
import ThrowStrip from '../components/ui/ThrowStrip.vue';
import Toggle from '../components/ui/Toggle.vue';
import { useCamera } from '../composables/useCamera.js';
import { useMarkingSession } from '../composables/useMarkingSession.js';
import { fill, useStrings } from '../i18n/index.js';
import { backTarget } from '../router/back.js';
import { PATHS } from '../router/paths.js';
import { storageEstimate } from '../storage/db.js';
import { calibrate, countFrames, deleteFrame, exportFrames, listFrames } from '../storage/frames.js';
import { useLobbyStore, useSettingsStore } from '../store/stores.js';
import { cameraSupported, type GrabbedFrame } from '../vision/camera.js';
import { cropFrameStyle, squareAround } from '../vision/crop.js';

type Mode = 'setup' | 'calibrate' | 'try';

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Four sensible starting positions, spread over the middle of the frame. */
function defaultHandles(width: number, height: number): Point[] {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.34;
  return [
    { x: cx, y: cy - r },
    { x: cx + r, y: cy },
    { x: cx, y: cy + r },
    { x: cx - r, y: cy },
  ];
}

const t = useStrings();
const route = useRoute();
const router = useRouter();
const settings = useSettingsStore();
const lobby = useLobbyStore();

const calibration = computed(() => settings.settings.calibration);
const fromGame = computed(() => route.query.from === 'game');

const cameraOn = ref(false);
const mode = ref<Mode>('setup');
const draft = ref<Point[]>([]);
const frozen = shallowRef<{ url: string; width: number; height: number } | null>(null);

/**
 * Try-it: the photograph being marked, the one waiting behind it, the darts in
 * the board, saving, undo and the leave prompt (capture/markingSession.ts). The
 * session drives the board watcher; this screen only hands it settles and taps,
 * and renders what it says.
 */
const { session, state: marking } = useMarkingSession();
const photo = computed(() => marking.value.photo);
const inBoard = computed(() => marking.value.inBoard);
const pullingOut = computed(() => marking.value.pullingOut);
/** The model the site ships, known from its manifest; the model itself loads only when asked for. */
const modelInfo = computed(() => marking.value.model.manifest);
// Off until a model has been tested on this board (issue #5): a proposal from
// one that has not marks flights as often as tips.
const proposing = ref(false);

const stats = ref({ total: 0, labelled: 0, bytes: 0 });
const usage = ref<{ usage: number; quota: number } | null>(null);
const confirmDelete = ref(false);
const busy = ref(false);

const paired = computed(() => lobby.mode === 'paired' && lobby.remoteStream !== null);

async function refreshStats() {
  stats.value = await countFrames();
  usage.value = await storageEstimate();
}
onMounted(refreshStats);

/** A settled photograph goes to the marking session, in try-it only. Nothing is ever saved here (issue #3). */
function onSettle(grabbed: GrabbedFrame, thumbnail?: Uint8Array, before?: Uint8Array | null) {
  if (mode.value === 'try') session.settle(grabbed, thumbnail, before);
}

const region = computed(() => {
  const c = calibration.value;
  return c && c.width > 0 ? boardRegion(c.toImage, { width: c.width, height: c.height }) : null;
});
const reference = computed(() => (calibration.value?.reference ? Uint8Array.from(calibration.value.reference) : null));

const camera = useCamera({
  active: () => cameraOn.value || paired.value,
  onSettle,
  captureOnSettle: () => mode.value === 'try' && calibration.value !== null,
  region,
  reference,
  stream: () => (paired.value ? lobby.remoteStream : null),
  grab: () => {
    const pairing = lobby.pairing;
    return paired.value && pairing ? () => pairing.requestPhoto() : null;
  },
  // Aligning the board is done on a still photograph: nothing to watch for.
  paused: () => mode.value === 'calibrate',
});

const frameSize = computed(() =>
  photo.value && mode.value === 'try'
    ? { width: photo.value.grabbed.width, height: photo.value.grabbed.height }
    : mode.value === 'calibrate' && frozen.value
      ? { width: frozen.value.width, height: frozen.value.height }
      : { width: camera.width.value || 1280, height: camera.height.value || 720 },
);

const staleCalibration = computed(
  () =>
    calibration.value !== null &&
    camera.width.value > 0 &&
    (calibration.value.width !== camera.width.value || calibration.value.height !== camera.height.value),
);

// Marking darts needs the board, not the wall around it: once calibrated, only
// the square around the board is shown. Calibrating needs the lot.
const crop = computed(() =>
  mode.value === 'try' && region.value && !staleCalibration.value && calibration.value?.width === frameSize.value.width
    ? squareAround(region.value, frameSize.value)
    : null,
);

// ---- calibration -----------------------------------------------------------

const draftCalibration = computed(() =>
  mode.value === 'calibrate' && draft.value.length === 4 ? calibrate(draft.value, CALIBRATION_BOARD_POINTS, frameSize.value) : null,
);

const view = computed(() => {
  const source = mode.value === 'calibrate' ? draftCalibration.value : calibration.value;
  return source ? assessBoardView(source.toImage, { width: source.width, height: source.height }) : null;
});

async function startCalibration() {
  const grabbed = await camera.capture();
  if (!grabbed) return;
  if (frozen.value) URL.revokeObjectURL(frozen.value.url);
  frozen.value = { url: URL.createObjectURL(grabbed.jpeg), width: grabbed.width, height: grabbed.height };
  draft.value =
    calibration.value && !staleCalibration.value ? calibration.value.imagePoints : defaultHandles(grabbed.width, grabbed.height);
  mode.value = 'calibrate';
}

function finishCalibration(save: boolean) {
  const made = draftCalibration.value;
  if (save && made) {
    const boardRect = boardRegion(made.toImage, { width: made.width, height: made.height });
    const thumb = camera.sampleThumbnail(boardRect);
    settings.saveCalibration({ ...made, ts: Date.now(), ...(thumb ? { reference: Array.from(thumb) } : {}) });
  }
  if (frozen.value) URL.revokeObjectURL(frozen.value.url);
  frozen.value = null;
  draft.value = [];
  mode.value = save ? 'try' : 'setup';
}
onBeforeUnmount(() => {
  if (frozen.value) URL.revokeObjectURL(frozen.value.url);
});

const handles = computed<OverlayHandle[]>(() => [
  { label: t.capture.landmarkTop, hint: t.capture.landmarkHintTop, point: draft.value[0] ?? { x: 0, y: 0 } },
  { label: t.capture.landmarkRight, hint: t.capture.landmarkHintRight, point: draft.value[1] ?? { x: 0, y: 0 } },
  { label: t.capture.landmarkBottom, hint: t.capture.landmarkHintBottom, point: draft.value[2] ?? { x: 0, y: 0 } },
  { label: t.capture.landmarkLeft, hint: t.capture.landmarkHintLeft, point: draft.value[3] ?? { x: 0, y: 0 } },
]);

function moveHandle(index: number, point: Point) {
  draft.value = draft.value.map((p, i) => (i === index ? point : p));
}

// ---- try it ----------------------------------------------------------------

watch(calibration, (next) => session.setCalibration(next), { immediate: true });
watch(() => settings.settings.callerEnabled, (on) => session.setCaller(on), { immediate: true });
watch(mode, (now) => now === 'try' && void session.findModel(), { immediate: true });
// The runtime and the model are only fetched once proposals are switched on.
watch(proposing, (on) => void session.switchModel(on), { immediate: true });
// It could not be loaded here: say so by switching back off.
watch(
  () => marking.value.model.status,
  (status) => {
    if (status === 'unavailable') proposing.value = false;
  },
);

// Leaving try-it ends the visit: by the time anyone comes back the darts may be
// out, or the camera recalibrated, and a mark of a dart in the board would be a
// ghost. Unmounting cannot ask, so it saves nothing: Back asks first.
watch(mode, (now) => now !== 'try' && session.end());
onBeforeUnmount(() => session.end());

// Done and Back go once the session lets them: straight away, or after the
// question about marks nobody saved has been answered.
watch(
  () => marking.value.leaving,
  (leaving) => {
    if (!leaving || leaving.asking) return;
    if (leaving.exit === 'done') mode.value = 'setup';
    else void router.push(backTarget(route, lobby.session !== null));
  },
);

/** The storage numbers follow whatever wrote or deleted a photograph. */
const refreshIf = (wrote: boolean) => {
  if (wrote) void refreshStats();
};
const save = () => void session.save().then(refreshIf);
const noNewDart = () => void session.noNewDart().then(refreshIf);
const undo = () => void session.undo().then(refreshIf);
const answer = (choice: 'save' | 'discard') => void session.answer(choice).then(refreshIf);

async function captureNow() {
  const grabbed = await camera.capture();
  if (grabbed) onSettle(grabbed);
}

function tryIt() {
  unlockCaller();
  mode.value = 'try';
}

// ---- export ----------------------------------------------------------------

async function exportAll() {
  busy.value = true;
  try {
    const frames = await listFrames(Number.MAX_SAFE_INTEGER);
    download(await exportFrames(frames), `treblewise-captures-${new Date().toISOString().slice(0, 10)}.zip`);
  } finally {
    busy.value = false;
  }
}

async function deleteAll() {
  if (!confirmDelete.value) {
    confirmDelete.value = true;
    setTimeout(() => (confirmDelete.value = false), 4000);
    return;
  }
  confirmDelete.value = false;
  const frames = await listFrames(Number.MAX_SAFE_INTEGER);
  await Promise.all(frames.map((frame) => deleteFrame(frame.id)));
  void refreshStats();
}

const overlayToImage = computed(() =>
  mode.value === 'calibrate'
    ? (draftCalibration.value?.toImage ?? null)
    : staleCalibration.value
      ? null
      : (calibration.value?.toImage ?? null),
);
const overlayDarts = computed(() => {
  const shown = photo.value;
  if (mode.value !== 'try' || !shown) return [];
  return shown.darts.map((dart, index) => ({
    img: dart.img,
    label: dart.by === 'model' ? `${formatHit(dart.hit)}?` : formatHit(dart.hit),
    kind: index < shown.inBoard ? ('inBoard' as const) : dart.by === 'model' ? ('proposed' as const) : ('new' as const),
  }));
});
const tap = (point: Point) => mode.value === 'try' && session.mark(point);

const ready = computed(() => (cameraOn.value || paired.value) && calibration.value !== null && !staleCalibration.value);

const coachMessage = computed(() => {
  const shown = photo.value;
  if (!shown && pullingOut.value) return t.capture.pullOut;
  if (!shown) return inBoard.value.length > 0 ? fill(t.capture.throwNext, { n: inBoard.value.length }) : t.capture.throwOne;
  if (shown.checking) return t.capture.looking;
  if (shown.proposed > 0 && !shown.edited) {
    return fill(t.capture.proposal, { hits: shown.darts.slice(-shown.proposed).map((dart) => formatHit(dart.hit)).join(', ') });
  }
  const fresh = shown.darts.length - shown.inBoard;
  if (fresh === 0 && shown.failed) return t.capture.modelFailed;
  if (fresh === 0 && shown.missed) return t.capture.modelSawNothing;
  if (fresh > 0) return fill(t.capture.markedSoFar, { inBoard: shown.inBoard, fresh, total: shown.darts.length });
  return shown.inBoard > 0 ? fill(t.capture.tapTheNewDart, { n: shown.inBoard }) : t.capture.tapTheDart;
});

const saveLabel = computed(() => {
  const shown = photo.value;
  if (shown && shown.proposed > 0 && !shown.edited) return t.capture.saveProposal;
  return shown && shown.darts.length > 0 ? fill(t.capture.saveFrame, { n: shown.darts.length }) : t.capture.saveFrameEmpty;
});

const attachVideo = (element: unknown) => {
  camera.video.value = element as HTMLVideoElement | null;
};
const supported = cameraSupported();
const storageLine = computed(() => {
  const { bytes } = stats.value;
  const size = bytes < 1_000_000 ? `${Math.round(bytes / 1000)} kB` : fill(t.capture.storage, { mb: (bytes / 1_000_000).toFixed(1) });
  return usage.value && usage.value.quota > 0 ? `${size} / ${(usage.value.quota / 1_000_000_000).toFixed(1)} GB` : size;
});
</script>

<template>
  <div :class="['screen', 'screen-capture', { 'screen-capture-try': mode === 'try' }]">
    <!-- One tree in every mode, so the video element is never remounted (it
         would lose its stream). The layout changes in CSS: in try-it on a wide
         screen the side column holds everything to read and press, and the
         board sits beside it; elsewhere it all stacks, board under the coach. -->
    <div :class="['capture-work', { 'capture-work-split': mode === 'try' }]">
      <div class="capture-side">
        <header class="screen-head">
          <!-- Back asks first when there are marks nobody saved (the marking session's leave). -->
          <button type="button" class="screen-back" @click="session.leave('back')">
            <span aria-hidden="true">‹</span> {{ fromGame ? t.capture.backToMatch : t.capture.back }}
          </button>
          <h1>{{ t.capture.title }}</h1>
          <Fold id="capture-about" :summary="t.capture.foldAbout">
            <p>{{ mode === 'try' ? t.capture.trySubtitle : t.capture.subtitle }}</p>
          </Fold>
        </header>

        <p v-if="!supported" class="warning">{{ t.capture.noCamera }}</p>
        <p v-if="camera.error.value" class="warning">{{ camera.error.value }}</p>
        <p v-if="staleCalibration && mode !== 'calibrate'" class="warning">
          {{
            fill(t.capture.calibrateStale, {
              old: `${calibration!.width}×${calibration!.height}`,
              now: `${camera.width.value}×${camera.height.value}`,
            })
          }}
        </p>

        <SetupCoach
          v-if="(cameraOn || paired) && mode !== 'try'"
          :calibrated="mode === 'calibrate' ? draftCalibration !== null : calibration !== null"
          :view="view"
          :quality="camera.quality.value"
          show-numbers
        />

        <div v-if="mode === 'try'" :class="`coach ${photo || pullingOut ? 'coach-warn' : 'coach-ready'}`" role="status">
          <span class="coach-dot" aria-hidden="true" />
          <span class="coach-message">{{ coachMessage }}</span>
        </div>

        <p v-if="mode === 'try' && (cameraOn || paired)" class="capture-status">
          {{ camera.moving.value ? t.capture.moving : t.capture.waiting }} · {{ camera.motion.value.toFixed(1) }} /
          {{ camera.change.value.toFixed(1) }} · {{ fill(t.capture.photoSize, { size: `${camera.width.value}×${camera.height.value}` }) }}
          <template v-if="camera.photo.value">
            · {{ fill(t.capture.photoTime, { ms: camera.photo.value.ms, dropped: camera.photo.value.dropped }) }}
          </template>
        </p>
        <PhoneBattery />

        <div v-if="mode === 'try'" class="capture-actions">
          <div class="controls">
            <button type="button" class="primary" :disabled="!marking.canSave" @click="save">{{ saveLabel }}</button>
            <button type="button" class="chip" :disabled="!photo" @click="session.skip()">{{ t.capture.skipPhoto }}</button>
            <button v-if="photo && photo.proposed > 0 && !photo.edited" type="button" class="chip" @click="noNewDart">
              {{ t.capture.noNewDart }}
            </button>
            <!-- Also the way out when the empty-board check cannot see the darts
                 are gone (a shadow that was not there at calibration). -->
            <button
              type="button"
              class="chip"
              :disabled="inBoard.length === 0 && (!photo || photo.inBoard === 0) && !pullingOut"
              @click="session.boardCleared()"
            >
              {{ t.capture.boardCleared }}
            </button>
            <button type="button" class="chip" :disabled="!camera.ready.value" @click="captureNow">{{ t.capture.captureNow }}</button>
            <button type="button" class="chip" :disabled="!marking.canUndo" @click="undo">{{ t.capture.undo }}</button>
            <button type="button" class="chip" @click="session.leave('done')">{{ t.capture.doneTrying }}</button>
          </div>

          <div v-if="marking.leaving?.asking" class="panel" role="alertdialog" :aria-label="t.capture.unsavedTitle">
            <p>{{ t.capture.unsavedTitle }}</p>
            <div class="controls">
              <button type="button" class="primary" @click="answer('save')">{{ t.capture.unsavedSave }}</button>
              <button type="button" class="chip" @click="answer('discard')">{{ t.capture.unsavedDiscard }}</button>
              <button type="button" class="chip" @click="session.answer('stay')">{{ t.capture.unsavedStay }}</button>
            </div>
          </div>

          <ThrowStrip
            v-if="marking.marked.length > 0"
            :who="fill(t.capture.markedCount, { n: marking.marked.length })"
            :darts="marking.marked.slice(-4)"
          />

          <Fold id="capture-marking" :summary="t.capture.foldMarking">
            <p class="hint">
              <b>{{ t.capture.markEveryDart }}</b> {{ t.capture.tryHelp }}
            </p>
          </Fold>
          <p v-if="marking.saved" class="hint">
            {{ fill(t.capture.savedNote, { n: marking.saved.length, hits: marking.saved.map((dart) => formatHit(dart.hit)).join(', ') }) }}
          </p>
          <p v-if="marking.waiting" class="warning">{{ t.capture.photoWaiting }}</p>

          <section v-if="modelInfo" class="panel">
            <div class="controls">
              <button type="button" :class="['chip', { 'chip-on': proposing }]" :aria-pressed="proposing" @click="proposing = !proposing">
                {{ proposing ? (marking.model.status === 'ready' ? t.capture.proposingOn : t.capture.proposingLoading) : t.capture.proposingOff }}
              </button>
            </div>
            <p v-if="photo?.blind" class="hint">{{ t.capture.blindFrame }}</p>
            <Fold id="capture-autoscorer" :summary="t.capture.foldAutoscorer">
              <p class="hint">{{ proposing ? t.capture.proposingHelp : t.capture.proposingOffHelp }}</p>
            </Fold>
            <p v-if="marking.tally.letStand + marking.tally.corrected > 0" class="hint">
              {{ fill(t.capture.verdicts, { right: marking.tally.letStand, n: marking.tally.letStand + marking.tally.corrected }) }}
            </p>
            <p class="hint">
              {{ fill(t.capture.modelName, { name: modelInfo.name }) }}
              <template v-if="modelInfo.deepdarts">{{ ` ${t.capture.deepdartsCredit}` }}</template>
              <template v-if="modelInfo.dartscribe">{{ ` ${t.capture.dartscribeCredit}` }}</template>
            </p>
          </section>
        </div>
      </div>

      <div class="stage" :style="{ aspectRatio: crop ? '1 / 1' : `${frameSize.width} / ${frameSize.height}` }">
        <div class="stage-frame" :style="cropFrameStyle(crop, frameSize)">
          <video :ref="attachVideo" class="stage-video" playsinline muted />
          <img v-if="mode === 'calibrate' && frozen" class="stage-frozen" :src="frozen.url" alt="" />
          <img v-if="mode === 'try' && photo" class="stage-frozen" :src="photo.url" alt="" />

          <BoardOverlay
            :width="frameSize.width"
            :height="frameSize.height"
            :to-image="overlayToImage"
            :handles="mode === 'calibrate' ? handles : []"
            :on-handle-move="moveHandle"
            :darts="overlayDarts"
            :on-dart-move="session.move"
            :on-tap="tap"
          />
        </div>
      </div>
    </div>

    <section v-if="mode === 'calibrate'" class="panel">
      <h2>{{ t.capture.calibrateTitle }}</h2>
      <p class="hint">{{ t.capture.calibrateHelp }}</p>
      <ul class="landmark-list">
        <li v-for="handle in handles" :key="handle.label">
          <b>{{ handle.label }}</b> {{ handle.hint }}
        </li>
      </ul>
      <p class="hint">
        {{ t.capture.calibrateError }}: <b>{{ draftCalibration ? `${draftCalibration.error.toFixed(1)} px` : '—' }}</b>
      </p>
      <div class="controls">
        <button type="button" class="primary" :disabled="!draftCalibration" @click="finishCalibration(true)">{{ t.capture.calibrateSave }}</button>
        <button type="button" class="chip" @click="finishCalibration(false)">{{ t.capture.calibrateCancel }}</button>
      </div>
    </section>

    <template v-if="mode === 'setup'">
      <div class="controls">
        <span v-if="paired" class="chip chip-on">{{ t.capture.phoneCamera }}</span>
        <Toggle v-else v-model="cameraOn" :label="cameraOn ? t.capture.stop : t.capture.start" />
        <button type="button" class="chip" :disabled="!camera.ready.value" @click="startCalibration">
          {{ calibration ? t.capture.recalibrate : t.capture.calibrate }}
        </button>
      </div>

      <button type="button" class="primary" :disabled="!ready" @click="tryIt">{{ t.capture.tryIt }}</button>

      <section class="panel">
        <h2>{{ t.capture.stepsTitle }}</h2>
        <ol class="steps">
          <li v-for="line in t.capture.steps" :key="line">{{ line }}</li>
        </ol>
      </section>
    </template>

    <section class="panel">
      <h2>{{ t.capture.frames }}</h2>
      <p><b>{{ stats.labelled }}</b> {{ t.capture.labelled }} · {{ storageLine }}</p>
      <p class="hint">{{ t.capture.privacy }}</p>
      <div class="controls">
        <button type="button" class="chip" :disabled="busy || stats.total === 0" @click="exportAll">
          {{ stats.total === 0 ? t.capture.exportEmpty : t.capture.export }}
        </button>
        <button type="button" class="chip" :disabled="stats.total === 0" @click="router.push(PATHS.review)">{{ t.review.open }}</button>
        <button type="button" class="chip" :disabled="stats.total === 0" @click="deleteAll">
          {{ confirmDelete ? t.capture.deleteAllConfirm : t.capture.deleteAll }}
        </button>
      </div>
    </section>
  </div>
</template>
