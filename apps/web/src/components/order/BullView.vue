<!--
  The bull-off, as the match's dart card is, at full size: the board close up
  rather than whole. Before any dart it shows the bull and the singles round
  it; the first dart zooms in on it, a line from the bull to where it landed,
  and each dart after pans and zooms the board to keep them all in the middle
  (bullFrame.ts). A band at the foot says whose turn it is.

  A tap puts a dart where it landed. A dart outside the frame is tapped on the
  whole board, one press of the corner button away.
-->
<script setup lang="ts">
import { BOARD, formatHit, scoreAt, type Hit, type Point } from '@treblewise/core';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

import { fill, useStrings } from '../../i18n/index.js';
import { COLOURS, buildBeds, numberPositions } from '../dartboardGeometry.js';
import Icon from '../ui/Icon.vue';
import { WHOLE_HALF, between, bullFrame, frameAround, fromView, toView, type Frame } from './bullFrame.js';

export interface ViewDart {
  id: string;
  /** The thrower's number, as on their card. */
  number: number;
  hit: Hit;
  pos: Point;
  /** The closest so far. */
  leader: boolean;
}

const props = withDefaults(defineProps<{ darts: ViewDart[]; disabled?: boolean }>(), { disabled: false });
const emit = defineEmits<{ hit: [hit: Hit, pos: Point] }>();

const t = useStrings();
const beds = buildBeds();
const numbers = numberPositions();

// ---- the view's size, and where it looks ------------------------------------

const box = ref<HTMLElement | null>(null);
/** In pixels; a guess until it is measured, as in tests. */
const view = shallowRef({ width: 640, height: 480 });
let observer: ResizeObserver | null = null;
onMounted(() => {
  if (!box.value || typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver(([entry]) => {
    if (entry && entry.contentRect.width > 0) view.value = { width: entry.contentRect.width, height: entry.contentRect.height };
  });
  observer.observe(box.value);
});

const whole = ref(false);
const target = computed<Frame>(() =>
  whole.value
    ? frameAround(WHOLE_HALF, view.value)
    : bullFrame(
        props.darts.map((dart) => dart.pos),
        view.value,
        { inset: 64 },
      ),
);

const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOVE_MS = 700;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const frame = shallowRef<Frame>(target.value);
let raf = 0;
/** A new frame is moved to, not jumped to; a resize just jumps. */
let resized = false;
watch(view, () => (resized = true));
watch(target, (to) => {
  cancelAnimationFrame(raf);
  if (reduced || resized || typeof requestAnimationFrame === 'undefined') {
    resized = false;
    frame.value = to;
    return;
  }
  const from = frame.value;
  const start = performance.now();
  const step = (now: number) => {
    const done = Math.min(1, (now - start) / MOVE_MS);
    frame.value = between(from, to, ease(done));
    if (done < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  observer?.disconnect();
});

/** The board drawn in millimetres, moved and scaled into the view. */
const boardTransform = computed(() => {
  const { x, y, scale } = frame.value;
  return `translate(${view.value.width / 2} ${view.value.height / 2}) scale(${scale}) translate(${-x} ${y})`;
});

const bull = computed(() => toView({ x: 0, y: 0 }, frame.value, view.value));
const marks = computed(() =>
  props.darts.map((dart) => {
    const at = toView(dart.pos, frame.value, view.value);
    // The badge goes beyond the dart, away from the bull, leaving the line
    // and the point it ends on in sight; the label beside the badge.
    const dx = at.x - bull.value.x;
    const dy = at.y - bull.value.y;
    const length = Math.hypot(dx, dy);
    const [ux, uy] = length > 1 ? [dx / length, dy / length] : [0.7, -0.7];
    const badge = { x: at.x + ux * 26, y: at.y + uy * 26 };
    const mm = Math.round(Math.hypot(dart.pos.x, dart.pos.y));
    return {
      ...dart,
      at,
      badge,
      label: { x: badge.x + (ux >= 0 ? 19 : -19), y: badge.y, anchor: ux >= 0 ? 'start' : 'end' },
      text: dart.hit.ring === 'miss' ? t.setup.order.bullOff : fill(t.setup.order.bullDistance, { mm }),
    };
  }),
);

// ---- tapping a dart in -------------------------------------------------------

const pressing = ref<{ x: number; y: number } | null>(null);
const scoring = computed(() => !props.disabled);

function inView(event: PointerEvent) {
  const rect = box.value!.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function down(event: PointerEvent) {
  if (!scoring.value || !box.value) return;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  pressing.value = inView(event);
}

function move(event: PointerEvent) {
  if (pressing.value) pressing.value = inView(event);
}

function up(event: PointerEvent) {
  if (!pressing.value) return;
  const pos = fromView(inView(event), frame.value, view.value);
  pressing.value = null;
  whole.value = false;
  emit('hit', scoreAt(pos), pos);
}

const preview = computed(() => {
  const at = pressing.value;
  return at ? { at, hit: formatHit(scoreAt(fromView(at, frame.value, view.value))) } : null;
});
</script>

<template>
  <div class="bull-view">
    <div
      ref="box"
      :class="['bull-view-stage', { 'bull-view-stage-live': scoring }]"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="pressing = null"
    >
      <svg class="bull-view-svg" :viewBox="`0 0 ${view.width} ${view.height}`" aria-hidden="true">
        <g :transform="boardTransform">
          <circle :r="BOARD.boardRadius" :fill="COLOURS.surround" />
          <g :stroke="COLOURS.wire" stroke-width="1" vector-effect="non-scaling-stroke">
            <path v-for="b in beds" :key="b.key" :d="b.d" :fill="b.fill" vector-effect="non-scaling-stroke" />
            <circle :r="BOARD.outerBullRadius" :fill="COLOURS.green" vector-effect="non-scaling-stroke" />
            <circle :r="BOARD.bullRadius" :fill="COLOURS.red" vector-effect="non-scaling-stroke" />
          </g>
          <g :fill="COLOURS.number" :font-size="26" font-weight="600" text-anchor="middle">
            <text v-for="n in numbers" :key="n.sector" :x="n.x" :y="n.y + 9">{{ n.sector }}</text>
          </g>
        </g>

        <!-- From the bull to each dart, drawn in pixels: the same weight at any zoom. -->
        <g v-for="mark in marks" :key="mark.id" :class="['bull-view-dart', { 'bull-view-dart-leader': mark.leader }]">
          <line class="bull-view-shade" :x1="bull.x" :y1="bull.y" :x2="mark.at.x" :y2="mark.at.y" />
          <line class="bull-view-line" :x1="bull.x" :y1="bull.y" :x2="mark.at.x" :y2="mark.at.y" />
          <line class="bull-view-stem" :x1="mark.at.x" :y1="mark.at.y" :x2="mark.badge.x" :y2="mark.badge.y" />
          <circle class="bull-view-point" :cx="mark.at.x" :cy="mark.at.y" r="4.5" />
          <g class="bull-view-mark" :transform="`translate(${mark.badge.x} ${mark.badge.y})`">
            <circle r="13" />
            <text dominant-baseline="central" text-anchor="middle">{{ mark.number }}</text>
          </g>
          <text class="bull-view-label" :x="mark.label.x" :y="mark.label.y" dominant-baseline="central" :text-anchor="mark.label.anchor">
            {{ mark.text }}
          </text>
        </g>
        <circle class="bull-view-centre" :cx="bull.x" :cy="bull.y" r="3" />

        <g v-if="preview" class="bull-view-preview" :transform="`translate(${preview.at.x} ${preview.at.y})`">
          <circle r="11" />
          <path d="M-20 0h12M8 0h12M0 -20v12M0 8v12" />
          <text y="-28" text-anchor="middle">{{ preview.hit }}</text>
        </g>
      </svg>

      <button
        type="button"
        class="btn-sm btn-icon bull-view-whole"
        :aria-label="whole ? t.setup.order.bullClose : t.setup.order.bullWhole"
        :aria-pressed="whole"
        :title="whole ? t.setup.order.bullClose : t.setup.order.bullWhole"
        @pointerdown.stop
        @pointerup.stop
        @click="whole = !whole"
      >
        <Icon :name="whole ? 'shrink' : 'expand'" :size="18" />
      </button>
    </div>
    <div class="bull-view-band"><slot /></div>
  </div>
</template>
