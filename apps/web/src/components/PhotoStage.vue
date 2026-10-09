<!--
  A photograph to put marks on: cropped to the board's square, with the board
  and the marks drawn over it, and a magnifying lens that follows the mouse, or
  the finger while it is down, to see whether a mark sits on its tip.

  Used where a person places or checks marks on a still photograph: Review,
  and the in-game correction.
-->
<script setup lang="ts">
import type { Matrix3, Point } from '@treblewise/core';
import { computed, onBeforeUnmount, ref, type StyleValue } from 'vue';

import type { Region } from '../vision/camera.js';
import { cropFrameStyle } from '../vision/crop.js';
import BoardOverlay, { type OverlayDart, type OverlayHandle } from './BoardOverlay.vue';
import { lensGeometry } from './lens.js';

const props = defineProps<{
  url: string;
  /** The photograph's own size. */
  width: number;
  height: number;
  /** The part of the photograph to show (the board's square), or null for all of it. */
  crop: Region | null;
  toImage?: Matrix3 | null;
  handles?: OverlayHandle[];
  darts?: OverlayDart[];
  onHandleMove?: (index: number, point: Point) => void;
  onDartMove?: (index: number, point: Point) => void;
  onTap?: (point: Point) => void;
  dim?: boolean;
  /** Sizing, from the screen that uses it. */
  stageStyle?: StyleValue;
}>();

interface Pointer {
  x: number;
  y: number;
  stageWidth: number;
  stageHeight: number;
}

const stage = ref<HTMLDivElement | null>(null);
const pointer = ref<Pointer | null>(null);
let pressed = false;

// A pointer reports far more often than the screen redraws; only the latest
// position matters, so the lens moves once per frame.
let latest: Pointer | null = null;
let frame = 0;
onBeforeUnmount(() => cancelAnimationFrame(frame));

function track(event: PointerEvent) {
  const rect = stage.value?.getBoundingClientRect();
  if (!rect || rect.width === 0) return;
  latest = { x: event.clientX - rect.left, y: event.clientY - rect.top, stageWidth: rect.width, stageHeight: rect.height };
  if (!frame) {
    frame = requestAnimationFrame(() => {
      frame = 0;
      pointer.value = latest;
    });
  }
}

function hide() {
  cancelAnimationFrame(frame);
  frame = 0;
  latest = null;
  pointer.value = null;
}

// Watching only: the marks themselves are moved by the overlay, which keeps
// the pointer captured while a mark is dragged.
function down(event: PointerEvent) {
  pressed = true;
  track(event);
}
function move(event: PointerEvent) {
  if (event.pointerType === 'mouse' || pressed) track(event);
}
function up(event: PointerEvent) {
  pressed = false;
  if (event.pointerType !== 'mouse') hide();
}
function leave(event: PointerEvent) {
  if (event.pointerType === 'mouse' && !pressed) hide();
}
function cancel() {
  pressed = false;
  hide();
}

const size = computed(() => ({ width: props.width, height: props.height }));
const lens = computed(() =>
  pointer.value
    ? lensGeometry(pointer.value, { width: pointer.value.stageWidth, height: pointer.value.stageHeight }, size.value, props.crop)
    : null,
);
const px = (n: number) => `${n}px`;
</script>

<template>
  <div class="photo-stage" :style="stageStyle" @pointerdown="down" @pointermove="move" @pointerup="up" @pointerleave="leave" @pointercancel="cancel">
    <div ref="stage" class="stage" :style="{ aspectRatio: crop ? '1 / 1' : `${width} / ${height}` }">
      <div class="stage-frame" :style="cropFrameStyle(crop, size)">
        <img class="stage-frozen" :src="url" alt="" />
        <BoardOverlay
          :width="width"
          :height="height"
          :to-image="toImage ?? null"
          :handles="handles ?? []"
          :darts="darts ?? []"
          :on-handle-move="onHandleMove"
          :on-dart-move="onDartMove"
          :on-tap="onTap"
          :dim="dim ?? false"
        />
      </div>
    </div>

    <div v-if="lens" class="lens" aria-hidden="true" :style="{ left: px(lens.left), top: px(lens.top), width: px(lens.size), height: px(lens.size) }">
      <div
        class="lens-content"
        :style="{ left: px(lens.content.left), top: px(lens.content.top), width: px(lens.content.width), height: px(lens.content.height) }"
      >
        <img class="stage-frozen" :src="url" alt="" />
        <BoardOverlay :width="width" :height="height" :to-image="toImage ?? null" :darts="darts ?? []" />
      </div>
      <span class="lens-crosshair" />
    </div>
  </div>
</template>
