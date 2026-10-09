<!--
  The setup coach: one line telling you whether the camera is looking at the
  board properly, and if not, what to do about it.

  A preview alone does not answer "has it found the board?", and "point it at
  the board from a metre away" is not advice anyone can act on while holding a
  phone. So this says exactly one thing at a time, in the order that matters,
  with a colour you can read from the oche. A warning about the picture itself
  says what it measured against the limit and what to do, and a reflection or
  a moved camera can be shown on the preview (QualityMarks.vue).
-->
<script setup lang="ts">
import type { Direction, ViewAssessment, ViewIssueCode } from '@treblewise/core';
import { computed } from 'vue';

import { fill, useStrings } from '../i18n/index.js';
import { IMAGE_THRESHOLDS, type ImageIssueCode, type ImageQuality } from '../vision/imageStats.js';

const props = withDefaults(
  defineProps<{
    calibrated: boolean;
    view: ViewAssessment | null;
    quality: ImageQuality | null;
    /** Shows the underlying numbers, for setting thresholds on a real board. */
    showNumbers?: boolean;
    /** Only the picture's own problems, and nothing at all while there are none: beside another coach line. */
    imageOnly?: boolean;
    /** Offers "Show where" for a warning the preview can point at. */
    onShowWhere?: () => void;
  }>(),
  { showNumbers: false, imageOnly: false, onShowWhere: undefined },
);

const t = useStrings();

type Said = { status: 'ready' | 'warn' | 'error'; message: string; image?: ImageIssueCode };

/** The one thing worth saying, and how loudly. */
const said = computed<Said | null>(() => {
  const direction = (value?: Direction) => (value ? t.coach.directions[value] : '');
  const imageIssue = (code: ImageIssueCode) => props.quality?.issues.includes(code) ?? false;
  const viewIssue = (code: ViewIssueCode) => (props.imageOnly ? undefined : props.view?.issues.find((issue) => issue.code === code));

  if (!props.imageOnly && !props.calibrated) return { status: 'error', message: t.coach.notCalibrated };
  if (imageIssue('moved')) return { status: 'error', message: t.coach.moved, image: 'moved' };
  const off = viewIssue('offFrame');
  if (off) return { status: 'error', message: `${t.coach.offFrame} ${direction(off.direction)}` };
  if (imageIssue('dark')) return { status: 'warn', message: t.coach.dark, image: 'dark' };
  if (imageIssue('glare')) return { status: 'warn', message: t.coach.glare, image: 'glare' };
  if (imageIssue('blurry')) return { status: 'warn', message: t.coach.blurry, image: 'blurry' };
  if (viewIssue('tooSmall')) return { status: 'warn', message: t.coach.tooSmall };
  if (viewIssue('tooClose')) return { status: 'warn', message: t.coach.tooClose };
  if (viewIssue('tooFlat')) return { status: 'warn', message: t.coach.tooFlat };
  if (viewIssue('tooSteep')) return { status: 'warn', message: t.coach.tooSteep };
  const centre = viewIssue('offCentre');
  if (centre) return { status: 'warn', message: `${t.coach.offCentre} ${direction(centre.direction)}` };
  if (imageIssue('washedOut')) return { status: 'warn', message: t.coach.washedOut, image: 'washedOut' };
  return props.imageOnly ? null : { status: 'ready', message: t.coach.ready };
});

/** What a picture warning measured, against the limit it is held to, and what fixes it. */
const detail = computed(() => {
  const quality = props.quality;
  const image = said.value?.image;
  if (!quality || !image) return null;
  const percent = (value: number) => Math.round(value * 100);
  switch (image) {
    case 'glare':
      return fill(t.coach.details.glare, { n: percent(quality.glare), limit: percent(IMAGE_THRESHOLDS.glare) });
    case 'moved':
      return fill(t.coach.details.moved, { n: percent(quality.drift), limit: percent(IMAGE_THRESHOLDS.drift) });
    case 'dark':
      return fill(t.coach.details.dark, { n: Math.round(quality.brightness), limit: IMAGE_THRESHOLDS.dark });
    case 'washedOut':
      return fill(t.coach.details.washedOut, { n: Math.round(quality.brightness), limit: IMAGE_THRESHOLDS.washedOut });
    case 'blurry':
      return fill(t.coach.details.blurry, { n: Math.round(quality.sharpness), limit: IMAGE_THRESHOLDS.sharpness });
  }
  return null;
});

const pointable = computed(() => said.value?.image === 'glare' || said.value?.image === 'moved');
</script>

<template>
  <div v-if="said" :class="`coach coach-${said.status}`" role="status">
    <span class="coach-dot" aria-hidden="true" />
    <span class="coach-message">{{ said.message }}</span>
    <button v-if="pointable && onShowWhere" type="button" class="chip" @click="onShowWhere">{{ t.coach.showWhere }}</button>
    <p v-if="detail" class="coach-detail">{{ detail }}</p>
    <span v-if="showNumbers && view && quality" class="coach-numbers">
      {{ t.coach.fill }} {{ Math.round(view.coverage * 100) }}% · {{ t.coach.angle }} {{ Math.round(view.tilt) }}° ·
      {{ t.coach.light }} {{ Math.round(quality.brightness) }} · {{ t.coach.detail }} {{ Math.round(quality.sharpness) }}
    </span>
  </div>
</template>
