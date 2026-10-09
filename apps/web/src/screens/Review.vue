<!--
  Review: the second look at every labelled photograph.

  Labels are made in a hurry, at the oche, between throws. This screen is where
  they are checked sitting down: each photograph with its marks, whole and
  undistorted, to fix, confirm or throw away. It exists because a training set
  nobody can inspect is a training set nobody can trust: some of the first
  photographs saved themselves, and some carry a model's guesses that landed on
  the flight (issues #3, #5).

  The list is at /review, each photograph at /review/:id, so one can be linked
  and reloaded into. A photograph confirmed here is recorded as `reviewed`, and
  that is exported.
-->
<script setup lang="ts">
import { boardRegion, formatHit } from '@treblewise/core';
import { computed, onMounted, ref, shallowRef, watch, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import PhotoStage from '../components/PhotoStage.vue';
import ScreenShell from '../components/ui/ScreenShell.vue';
import Segmented from '../components/ui/Segmented.vue';
import { fill, useStrings } from '../i18n/index.js';
import { PATHS } from '../router/paths.js';
import { deleteFrame, listFrames, putFrame, readDart, type CapturedFrame, type LabelledDart } from '../storage/frames.js';
import { filterFrames, hasModelMarks, markedBy, modelsWithMarks, type ReviewFilter } from '../storage/review.js';
import { squareAround } from '../vision/crop.js';

const PAGE = 12;

/**
 * The same marks, by value. Not by identity: every reload reads the
 * photographs back from IndexedDB as new objects, and comparing objects made
 * every photograph after the first one "changed", which disabled Previous,
 * Next and Back to the list.
 */
function sameMarks(a: readonly LabelledDart[], b: readonly LabelledDart[]): boolean {
  return (
    a.length === b.length &&
    a.every((dart, i) => {
      const other = b[i]!;
      return (
        dart.img.x === other.img.x &&
        dart.img.y === other.img.y &&
        dart.board.x === other.board.x &&
        dart.board.y === other.board.y &&
        dart.hit.ring === other.hit.ring &&
        dart.hit.value === other.hit.value &&
        dart.by === other.by
      );
    })
  );
}

/** The board's square in a stored photograph, from the calibration it was taken with. */
function reviewCrop(frame: CapturedFrame) {
  const size = { width: frame.width, height: frame.height };
  const region = boardRegion(frame.calibration.toImage, size);
  return region ? squareAround(region, size) : null;
}

const t = useStrings();
const route = useRoute();
const router = useRouter();

const frames = shallowRef<CapturedFrame[] | null>(null);
const filter = ref<ReviewFilter>('all');
const page = ref(0);
/** The marks as edited; saved back only by "Looks right". */
const marks = shallowRef<LabelledDart[]>([]);
const confirm = ref<string | null>(null);

async function reload() {
  frames.value = await listFrames(Number.MAX_SAFE_INTEGER);
}
onMounted(reload);

const openId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null));
const open = computed(() => (frames.value ?? []).find((frame) => frame.id === openId.value) ?? null);

// A photograph opens with its marks as stored.
watch(
  () => open.value?.id,
  () => {
    marks.value = open.value?.darts ?? [];
    confirm.value = null;
  },
  { immediate: true },
);

const shown = computed(() => filterFrames(frames.value ?? [], filter.value));
const pages = computed(() => Math.max(1, Math.ceil(shown.value.length / PAGE)));
const current = computed(() => Math.min(page.value, pages.value - 1));
const visible = computed(() => shown.value.slice(current.value * PAGE, current.value * PAGE + PAGE));
const models = computed(() => modelsWithMarks(frames.value ?? []));
const filterOptions = computed(() =>
  (['all', 'unreviewed', 'model'] as const).map((value) => ({
    value,
    label: `${t.review.filters[value]} (${filterFrames(frames.value ?? [], value).length})`,
  })),
);
watch(filter, () => (page.value = 0));

// Object URLs only for what is on screen: a few hundred full-size JPEGs at once
// is more memory than a phone has.
const urls = shallowRef(new Map<string, string>());
watchEffect((onCleanup) => {
  const map = new Map<string, string>();
  for (const frame of open.value ? [open.value] : visible.value) map.set(frame.id, URL.createObjectURL(frame.jpeg));
  urls.value = map;
  onCleanup(() => map.forEach((url) => URL.revokeObjectURL(url)));
});

const openFrame = (frame: CapturedFrame) => void router.push(`${PATHS.review}/${frame.id}`);
const backToList = () => void router.push(PATHS.review);

const dirty = computed(() => open.value !== null && !sameMarks(marks.value, open.value.darts));

/** The neighbour in the filtered list, to move through them without the list. */
function neighbour(step: 1 | -1): CapturedFrame | null {
  if (!open.value) return null;
  const index = shown.value.findIndex((frame) => frame.id === open.value!.id);
  return index < 0 ? null : (shown.value[index + step] ?? null);
}

async function saveOpen() {
  const frame = open.value;
  if (!frame || marks.value.length === 0) return;
  const next = neighbour(1);
  const stillModel = marks.value.some((dart) => dart.by === 'model');
  const { model: _model, ...rest } = frame;
  await putFrame({
    ...rest,
    darts: marks.value,
    labelled: true,
    reviewed: true,
    // Once no mark of the model's is left standing, the frame is a person's.
    ...(stillModel && frame.model ? { model: frame.model } : {}),
  });
  await reload();
  if (next) openFrame(next);
  else backToList();
}

async function deleteOpen() {
  const frame = open.value;
  if (!frame) return;
  const next = neighbour(1) ?? neighbour(-1);
  await deleteFrame(frame.id);
  await reload();
  if (next) openFrame(next);
  else backToList();
}

async function deleteByModel(model: string) {
  if (confirm.value !== `model:${model}`) {
    confirm.value = `model:${model}`;
    return;
  }
  confirm.value = null;
  await Promise.all(markedBy(frames.value ?? [], model).map((frame) => deleteFrame(frame.id)));
  await reload();
}

function moveMark(index: number, point: { x: number; y: number }) {
  const frame = open.value;
  if (frame) marks.value = marks.value.map((dart, i) => (i === index ? readDart(frame.calibration, point) : dart));
}
function addMark(point: { x: number; y: number }) {
  const frame = open.value;
  if (frame) marks.value = [...marks.value, readDart(frame.calibration, point)];
}
const removeMark = (index: number) => {
  marks.value = marks.value.filter((_, i) => i !== index);
};
const reviewDarts = computed(() =>
  marks.value.map((dart, index) => ({
    img: dart.img,
    label: `${index + 1} · ${formatHit(dart.hit)}${dart.by === 'model' ? '?' : ''}`,
    kind: dart.by === 'model' ? ('proposed' as const) : ('new' as const),
  })),
);
</script>

<template>
  <div v-if="frames === null" class="screen screen-review" />

  <ScreenShell
    v-else-if="openId"
    name="review"
    :title="t.review.title"
    :lead="open ? t.review.detailHelp : t.review.missing"
    :back-label="t.review.backToList"
    :back-disabled="dirty"
    :on-back="backToList"
  >
    <template v-if="open">
      <PhotoStage
        v-if="urls.get(open.id)"
        class="review-board"
        :url="urls.get(open.id)!"
        :width="open.width"
        :height="open.height"
        :crop="reviewCrop(open)"
        :to-image="open.calibration.toImage"
        :darts="reviewDarts"
        :on-dart-move="moveMark"
        :on-tap="addMark"
      />

      <div class="chip-row">
        <button
          v-for="(dart, index) in marks"
          :key="index"
          type="button"
          class="chip"
          :aria-label="fill(t.review.removeMark, { n: index + 1 })"
          @click="removeMark(index)"
        >
          {{ index + 1 }} · {{ formatHit(dart.hit) }}{{ dart.by === 'model' ? ` (${t.review.byModel})` : '' }} ×
        </button>
      </div>
      <p class="hint">{{ open.reviewed ? t.review.alreadyReviewed : t.review.notReviewed }}{{ dirty ? ` ${t.review.unsaved}` : '' }}</p>

      <div class="controls">
        <button type="button" class="primary" :disabled="marks.length === 0" @click="saveOpen">{{ t.review.looksRight }}</button>
        <button type="button" class="chip" @click="confirm === 'delete' ? deleteOpen() : (confirm = 'delete')">
          {{ confirm === 'delete' ? t.review.deleteConfirm : t.review.deletePhoto }}
        </button>
        <button v-if="dirty" type="button" class="chip" @click="marks = open.darts">{{ t.review.discard }}</button>
      </div>
    </template>

    <template #actions>
      <button type="button" class="chip" :disabled="dirty || !neighbour(-1)" @click="openFrame(neighbour(-1)!)">{{ t.review.previous }}</button>
      <button type="button" class="chip" :disabled="dirty || !neighbour(1)" @click="openFrame(neighbour(1)!)">{{ t.review.next }}</button>
    </template>
  </ScreenShell>

  <ScreenShell
    v-else
    name="review"
    :title="t.review.title"
    :lead="fill(t.review.subtitle, { n: frames.length, reviewed: frames.filter((frame) => frame.reviewed).length })"
    :back-label="t.review.back"
  >
    <Segmented v-model="filter" :options="filterOptions" :label="t.review.filterLabel" />

    <section v-if="models.length > 0" class="panel">
      <p class="hint">{{ t.review.modelHelp }}</p>
      <div class="controls">
        <button v-for="{ model, frames: count } in models" :key="model" type="button" class="chip" @click="deleteByModel(model)">
          {{ confirm === `model:${model}` ? fill(t.review.deleteModelConfirm, { n: count }) : fill(t.review.deleteModel, { model, n: count }) }}
        </button>
      </div>
    </section>

    <p v-if="shown.length === 0" class="hint">{{ t.review.empty }}</p>

    <ul class="review-grid">
      <li v-for="frame in visible" :key="frame.id">
        <button type="button" class="review-card" @click="openFrame(frame)">
          <img :src="urls.get(frame.id)" alt="" loading="lazy" :style="{ aspectRatio: `${frame.width} / ${frame.height}` }" />
          <span class="review-card-line">{{ frame.darts.map((dart) => formatHit(dart.hit)).join(', ') || t.review.noMarks }}</span>
          <span class="review-card-tags">
            {{ frame.source === 'game' ? t.review.fromGame : t.review.fromLab }}{{ hasModelMarks(frame) ? ` · ${t.review.byModel}` : ''
            }}{{ frame.reviewed ? ` · ${t.review.reviewedTag}` : '' }}
          </span>
        </button>
      </li>
    </ul>

    <div v-if="pages > 1" class="controls">
      <button type="button" class="chip" :disabled="current === 0" @click="page = current - 1">{{ t.review.previous }}</button>
      <span class="hint">{{ fill(t.review.page, { n: current + 1, of: pages }) }}</span>
      <button type="button" class="chip" :disabled="current >= pages - 1" @click="page = current + 1">{{ t.review.next }}</button>
    </div>
  </ScreenShell>
</template>
