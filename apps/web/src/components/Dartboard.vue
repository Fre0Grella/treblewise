<!--
  The board, drawn from the same millimetre geometry the autoscorer uses.

  Tapping it records where the dart landed, not just what it scored, which is
  what the positional statistics in docs/04-stats.md are built on. The SVG
  user space *is* board space (millimetres, origin at the bull, y flipped for
  the screen), so a tap converts to a position with no magic numbers.

  Precision on a phone is the whole problem here. A treble bed is 8 mm wide —
  about six pixels on a phone, and entirely hidden under a fingertip. So the
  board works like a text cursor on a touchscreen: press, and a magnifying lens
  appears *offset from the finger* showing the board underneath at three times
  the size with a crosshair on the exact point; drag to adjust; lift to score.
-->
<script setup lang="ts">
import { BOARD, formatHit, scoreAt, targetPoint, type Hit, type Point } from '@treblewise/core';
import { computed, ref, useId } from 'vue';

import { COLOURS, LENS, R, boardPointAt, buildBeds, numberPositions, placeLens } from './dartboardGeometry.js';

export interface BoardDart {
  id: string;
  hit: Hit;
  pos?: Point;
  /** Dimmed, for darts from earlier visits. */
  past?: boolean;
}

const props = withDefaults(
  defineProps<{
    darts?: BoardDart[];
    /** Drawn as a ring, to show where a checkout route says to aim. */
    target?: Hit | null;
    disabled?: boolean;
    /** Taps score: off, the board is a picture of where darts landed. */
    interactive?: boolean;
    /**
     * Drawn as a picture and nothing else: no taps, no lens, nothing for a
     * screen reader. The landing page uses it as its backdrop, where its size
     * and motion come from the element around it.
     */
    decorative?: boolean;
  }>(),
  { darts: () => [], target: null, disabled: false, interactive: false, decorative: false },
);

const emit = defineEmits<{ hit: [hit: Hit, pos: Point] }>();

const beds = buildBeds();
const numbers = numberPositions();

// Ids have to be unique per instance: two boards on one page would otherwise
// share a lens clip and magnify each other.
const uid = useId().replace(/[^a-zA-Z0-9-]/g, '');
const artId = `board-${uid}`;
const dartsId = `darts-${uid}`;
const clipId = `lens-${uid}`;

const svg = ref<SVGSVGElement | null>(null);
const preview = ref<{ pos: Point; hit: Hit } | null>(null);
const scoring = computed(() => props.interactive && !props.disabled && !props.decorative);

function positionOf(event: PointerEvent): Point | null {
  return svg.value ? boardPointAt(svg.value.getBoundingClientRect(), event.clientX, event.clientY) : null;
}

function track(event: PointerEvent) {
  if (!scoring.value) return;
  const pos = positionOf(event);
  if (!pos) return;
  const hit = scoreAt(pos);
  const current = preview.value;
  // A short tick whenever the score under the finger changes: on a phone
  // that lands before the eye has read the lens.
  if (current === null || current.hit.value !== hit.value || current.hit.ring !== hit.ring) navigator.vibrate?.(6);
  preview.value = { pos, hit };
}

function down(event: PointerEvent) {
  if (props.decorative) return;
  (event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId);
  track(event);
}

function move(event: PointerEvent) {
  if (preview.value) track(event);
}

function commit(event: PointerEvent) {
  if (!scoring.value) return;
  const pos = positionOf(event) ?? preview.value?.pos;
  preview.value = null;
  if (pos) emit('hit', scoreAt(pos), pos);
}

const targetPos = computed(() => (props.target && props.target.ring !== 'miss' ? targetPoint(props.target) : null));

// The finger's point and the lens, both in SVG coordinates.
const finger = computed(() => (preview.value ? { x: preview.value.pos.x, y: -preview.value.pos.y } : null));
const lens = computed(() => (finger.value ? placeLens(finger.value) : null));
const lensTransform = computed(() =>
  finger.value && lens.value
    ? `translate(${lens.value.cx} ${lens.value.cy}) scale(${LENS.magnification}) translate(${-finger.value.x} ${-finger.value.y})`
    : '',
);
</script>

<template>
  <svg
    ref="svg"
    :class="decorative ? undefined : 'dartboard'"
    :viewBox="`${-R} ${-R} ${2 * R} ${2 * R}`"
    :role="decorative ? undefined : interactive ? 'button' : 'img'"
    :aria-label="decorative ? undefined : 'Dartboard'"
    :aria-hidden="decorative || undefined"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="commit"
    @pointercancel="preview = null"
  >
    <defs>
      <g :id="artId">
        <circle :cx="0" :cy="0" :r="R" :fill="COLOURS.surround" />
        <g :stroke="COLOURS.wire" :stroke-width="0.8">
          <path v-for="b in beds" :key="b.key" :d="b.d" :fill="b.fill" />
          <circle :cx="0" :cy="0" :r="BOARD.outerBullRadius" :fill="COLOURS.green" />
          <circle :cx="0" :cy="0" :r="BOARD.bullRadius" :fill="COLOURS.red" />
        </g>
        <!-- A backdrop turns: numbers going round upside down are noise. -->
        <g v-if="!decorative" :fill="COLOURS.number" :font-size="26" font-weight="600" text-anchor="middle">
          <text v-for="n in numbers" :key="n.sector" :x="n.x" :y="n.y + 9">{{ n.sector }}</text>
        </g>
      </g>

      <g :id="dartsId">
        <template v-for="(dart, index) in darts" :key="dart.id">
          <g v-if="dart.pos" :opacity="dart.past ? 0.35 : 1">
            <circle :cx="dart.pos.x" :cy="-dart.pos.y" :r="7" :fill="COLOURS.marker" :stroke="COLOURS.ink" :stroke-width="2" />
            <text :x="dart.pos.x" :y="-dart.pos.y + 4" :fill="COLOURS.ink" :font-size="11" font-weight="700" text-anchor="middle">
              {{ index + 1 }}
            </text>
          </g>
        </template>
      </g>

      <clipPath v-if="lens" :id="clipId">
        <circle :cx="lens.cx" :cy="lens.cy" :r="LENS.radius" />
      </clipPath>
    </defs>

    <use :href="`#${artId}`" />

    <circle
      v-if="targetPos"
      class="dartboard-target"
      :cx="targetPos.x"
      :cy="-targetPos.y"
      :r="9"
      fill="none"
      :stroke="COLOURS.ink"
      :stroke-width="2.5"
    />

    <use :href="`#${dartsId}`" />

    <g v-if="preview && finger && lens" class="dartboard-lens" pointer-events="none">
      <!-- Where the finger actually is, left visible under the lens. -->
      <circle :cx="finger.x" :cy="finger.y" :r="12" fill="none" :stroke="COLOURS.ink" :stroke-width="1.6" :opacity="0.9" />
      <circle :cx="finger.x" :cy="finger.y" :r="2" :fill="COLOURS.ink" />

      <circle :cx="lens.cx" :cy="lens.cy" :r="LENS.radius + 3" :fill="COLOURS.surround" :stroke="COLOURS.ink" :stroke-width="3" />

      <g :clip-path="`url(#${clipId})`">
        <use :href="`#${artId}`" :transform="lensTransform" />
        <use :href="`#${dartsId}`" :transform="lensTransform" />

        <!-- The crosshair sits at the lens centre, which is the finger's exact
             point magnified: the whole purpose of the thing. -->
        <g :stroke="COLOURS.ink" :stroke-width="1.8" :opacity="0.95">
          <line :x1="lens.cx - LENS.radius" :y1="lens.cy" :x2="lens.cx - 9" :y2="lens.cy" />
          <line :x1="lens.cx + 9" :y1="lens.cy" :x2="lens.cx + LENS.radius" :y2="lens.cy" />
          <line :x1="lens.cx" :y1="lens.cy - LENS.radius" :x2="lens.cx" :y2="lens.cy - 9" />
          <line :x1="lens.cx" :y1="lens.cy + 9" :x2="lens.cx" :y2="lens.cy + LENS.radius" />
        </g>
        <circle :cx="lens.cx" :cy="lens.cy" :r="3.5" fill="none" :stroke="COLOURS.ink" :stroke-width="1.8" />

        <rect :x="lens.cx - 34" :y="lens.cy + LENS.radius - 30" :width="68" :height="26" :rx="8" :fill="COLOURS.plate" />
        <text :x="lens.cx" :y="lens.cy + LENS.radius - 11" :fill="COLOURS.ink" :font-size="19" font-weight="700" text-anchor="middle">
          {{ formatHit(preview.hit) }}
        </text>
      </g>
    </g>
  </svg>
</template>
