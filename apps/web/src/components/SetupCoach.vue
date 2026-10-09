<!--
  The setup coach: one line telling you whether the camera is looking at the
  board properly, and if not, what to do about it.

  A preview alone does not answer "has it found the board?", and "point it at
  the board from a metre away" is not advice anyone can act on while holding a
  phone. So this says exactly one thing at a time, in the order that matters,
  with a colour you can read from the oche.
-->
<script setup lang="ts">
import type { Direction, ViewAssessment, ViewIssueCode } from '@treblewise/core';
import { computed } from 'vue';

import { useStrings } from '../i18n/index.js';
import type { ImageIssueCode, ImageQuality } from '../vision/imageStats.js';

const props = withDefaults(
  defineProps<{
    calibrated: boolean;
    view: ViewAssessment | null;
    quality: ImageQuality | null;
    /** Shows the underlying numbers, for setting thresholds on a real board. */
    showNumbers?: boolean;
  }>(),
  { showNumbers: false },
);

const t = useStrings();

/** The one thing worth saying, and how loudly. */
const said = computed<{ status: 'ready' | 'warn' | 'error'; message: string }>(() => {
  const direction = (value?: Direction) => (value ? t.coach.directions[value] : '');
  const imageIssue = (code: ImageIssueCode) => props.quality?.issues.includes(code) ?? false;
  const viewIssue = (code: ViewIssueCode) => props.view?.issues.find((issue) => issue.code === code);

  if (!props.calibrated) return { status: 'error', message: t.coach.notCalibrated };
  if (imageIssue('moved')) return { status: 'error', message: t.coach.moved };
  const off = viewIssue('offFrame');
  if (off) return { status: 'error', message: `${t.coach.offFrame} ${direction(off.direction)}` };
  if (imageIssue('dark')) return { status: 'warn', message: t.coach.dark };
  if (imageIssue('glare')) return { status: 'warn', message: t.coach.glare };
  if (imageIssue('blurry')) return { status: 'warn', message: t.coach.blurry };
  if (viewIssue('tooSmall')) return { status: 'warn', message: t.coach.tooSmall };
  if (viewIssue('tooClose')) return { status: 'warn', message: t.coach.tooClose };
  if (viewIssue('tooFlat')) return { status: 'warn', message: t.coach.tooFlat };
  if (viewIssue('tooSteep')) return { status: 'warn', message: t.coach.tooSteep };
  const centre = viewIssue('offCentre');
  if (centre) return { status: 'warn', message: `${t.coach.offCentre} ${direction(centre.direction)}` };
  if (imageIssue('washedOut')) return { status: 'warn', message: t.coach.washedOut };
  return { status: 'ready', message: t.coach.ready };
});
</script>

<template>
  <div :class="`coach coach-${said.status}`" role="status">
    <span class="coach-dot" aria-hidden="true" />
    <span class="coach-message">{{ said.message }}</span>
    <span v-if="showNumbers && view && quality" class="coach-numbers">
      {{ t.coach.fill }} {{ Math.round(view.coverage * 100) }}% · {{ t.coach.angle }} {{ Math.round(view.tilt) }}° ·
      {{ t.coach.light }} {{ Math.round(quality.brightness) }} · {{ t.coach.detail }} {{ Math.round(quality.sharpness) }}
    </span>
  </div>
</template>
