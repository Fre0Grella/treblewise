<!--
  Match by match (issue #27): the three-dart average and the checkout
  percentage of every match, oldest first, as two areas, with the period's
  average as a dotted line across. A cursor picks one match and shows its date
  and both numbers beside it; it follows a drag or a hover over the chart, and
  the slider under it, which is also how a keyboard or a screen reader moves it.

  The two have their own scales: the average up to a little over its best, the
  checkout percentage from 0 to 100 in the lower half, as DartsMind keeps it,
  so it sits under the average rather than over it. The areas stretch to the
  chart's width, so their strokes do not scale and the dots and the tags are
  HTML on top.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { fill, useStrings } from '../../i18n/index.js';
import { PATHS } from '../../router/paths.js';

export interface MatchPoint {
  /** The match, to open it in the history. */
  id: string;
  /** When it was played: its last dart. */
  at: number;
  average: number;
  /** 0–100, or null when no double was thrown at. */
  checkoutPercent: number | null;
}

const props = defineProps<{
  points: MatchPoint[];
  /** The average over the whole period, drawn dotted across. */
  reference: number;
}>();

const t = useStrings();

const W = 320;
const H = 160;
/** Room above the highest average, so its peak does not touch the top. */
const HEADROOM = 1.15;
/** The share of the height a checkout of 100% reaches. */
const CHECKOUT_SHARE = 0.5;
/** Room at either end, so the first and last matches' dots are whole. */
const INSET = 6;

const selected = ref(props.points.length - 1);
// A new player or period: the latest match again.
watch(
  () => props.points,
  (points) => (selected.value = points.length - 1),
);
const index = computed(() => Math.min(Math.max(selected.value, 0), props.points.length - 1));
const point = computed(() => props.points[index.value]!);

const chart = computed(() => {
  const { points } = props;
  const top = Math.max(...points.map((p) => p.average), props.reference, 1) * HEADROOM;
  const x = (i: number) => (points.length === 1 ? W / 2 : INSET + (i / (points.length - 1)) * (W - 2 * INSET));
  const yAverage = (value: number) => H - (value / top) * H;
  const yCheckout = (value: number | null) => H - ((value ?? 0) / 100) * H * CHECKOUT_SHARE;
  // Flat out to the edges from the first and last matches.
  const area = (y: (p: MatchPoint) => number) =>
    `M0 ${H} L0 ${y(points[0]!)} ${points.map((p, i) => `L${x(i)} ${y(p)}`).join(' ')} L${W} ${y(points.at(-1)!)} L${W} ${H} Z`;
  const line = (y: (p: MatchPoint) => number) =>
    `M0 ${y(points[0]!)} ${points.map((p, i) => `L${x(i)} ${y(p)}`).join(' ')} L${W} ${y(points.at(-1)!)}`;
  return {
    x,
    yAverage,
    yCheckout,
    averageArea: area((p) => yAverage(p.average)),
    averageLine: line((p) => yAverage(p.average)),
    checkoutArea: area((p) => yCheckout(p.checkoutPercent)),
    checkoutLine: line((p) => yCheckout(p.checkoutPercent)),
    referenceY: yAverage(props.reference),
  };
});

/** A position in the chart, as a percentage of its box. */
const left = (x: number) => `${(x / W) * 100}%`;
const down = (y: number) => `${(y / H) * 100}%`;

const cursorX = computed(() => chart.value.x(index.value));
/** The tags sit beside the cursor, on whichever side has the room. */
const tagsOnLeft = computed(() => cursorX.value > W * 0.6);

const two = (n: number) => String(n).padStart(2, '0');
function when(at: number): { date: string; time: string } {
  const d = new Date(at);
  return {
    date: `${d.getFullYear()}/${two(d.getMonth() + 1)}/${two(d.getDate())}`,
    time: `${two(d.getHours())}:${two(d.getMinutes())}`,
  };
}
const shown = computed(() => ({
  ...when(point.value.at),
  average: point.value.average.toFixed(1),
  checkout: point.value.checkoutPercent === null ? '—' : `${point.value.checkoutPercent.toFixed(0)}%`,
}));
const readout = computed(() =>
  fill(t.stats.trendReadout, {
    date: `${shown.value.date} ${shown.value.time}`,
    average: shown.value.average,
    checkout: shown.value.checkout,
  }),
);

// Dragging, or a mouse passing over: the nearest match to the pointer.
const dragging = ref(false);
function pick(event: PointerEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const across = (event.clientX - box.left) / box.width;
  if (!Number.isFinite(across)) return;
  const at = Math.min(Math.max((across * W - INSET) / (W - 2 * INSET), 0), 1);
  selected.value = Math.round(at * (props.points.length - 1));
}
function press(event: PointerEvent) {
  dragging.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  pick(event);
}
function move(event: PointerEvent) {
  if (dragging.value || event.pointerType === 'mouse') pick(event);
}
</script>

<template>
  <figure class="match-trend">
    <figcaption class="match-trend-head">
      <span>{{ fill(t.stats.trendFrom, { n: points.length }) }}</span>
      <span class="match-trend-legend" aria-hidden="true">
        <span class="match-trend-key match-trend-key-average">{{ t.stats.trendAverage }}</span>
        <span class="match-trend-key match-trend-key-checkout">{{ t.stats.trendCheckout }}</span>
      </span>
    </figcaption>

    <div
      class="match-trend-plot"
      aria-hidden="true"
      @pointerdown="press"
      @pointermove="move"
      @pointerup="dragging = false"
      @pointercancel="dragging = false"
    >
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
        <path class="match-trend-area-average" :d="chart.averageArea" />
        <path class="match-trend-line-average" :d="chart.averageLine" vector-effect="non-scaling-stroke" />
        <path class="match-trend-area-checkout" :d="chart.checkoutArea" />
        <path class="match-trend-line-checkout" :d="chart.checkoutLine" vector-effect="non-scaling-stroke" />
        <line
          class="match-trend-reference"
          :x1="0"
          :y1="chart.referenceY"
          :x2="W"
          :y2="chart.referenceY"
          vector-effect="non-scaling-stroke"
        />
        <line class="match-trend-cursor" :x1="cursorX" :y1="0" :x2="cursorX" :y2="H" vector-effect="non-scaling-stroke" />
      </svg>

      <span class="match-trend-reference-label" :style="{ top: down(chart.referenceY) }">{{ reference.toFixed(1) }}</span>
      <span
        class="match-trend-dot match-trend-dot-average"
        :style="{ left: left(cursorX), top: down(chart.yAverage(point.average)) }"
      />
      <span
        class="match-trend-dot match-trend-dot-checkout"
        :style="{ left: left(cursorX), top: down(chart.yCheckout(point.checkoutPercent)) }"
      />
      <span
        class="match-trend-tags"
        :style="tagsOnLeft ? { right: `calc(${100 - (cursorX / W) * 100}% + 8px)` } : { left: `calc(${left(cursorX)} + 8px)` }"
      >
        <span class="match-trend-when">{{ shown.date }}<br />{{ shown.time }}</span>
        <span class="match-trend-tag match-trend-tag-average">{{ shown.average }}</span>
        <span class="match-trend-tag match-trend-tag-checkout">{{ shown.checkout }}</span>
      </span>
    </div>

    <input
      v-model.number="selected"
      class="match-trend-slider"
      type="range"
      min="0"
      :max="points.length - 1"
      step="1"
      :aria-label="t.stats.trendSlider"
      :aria-valuetext="readout"
    />
    <p class="match-trend-foot">
      <RouterLink :to="PATHS.match.replace(':id', point.id)">{{ t.stats.trendOpen }}</RouterLink>
    </p>
  </figure>
</template>
