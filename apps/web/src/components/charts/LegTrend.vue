<!--
  Leg by leg (issue #27): the three-dart average and the checkout percentage
  of every leg, oldest first, as two areas, with the period's average as a
  dotted line across. Behind them, the days: every other one shaded and named,
  so legs played close together read as close together.

  A cursor picks one leg and shows its date and both numbers beside it, only
  while it is in use: a pointer over the chart, a finger on it, or the slider
  under it in a keyboard's hands. The slider is also how a screen reader moves
  it. The leg picked last stays picked, for "Open its match".

  The two have their own scales: the average up to a little over its best, the
  checkout percentage from 0 to 100 in the lower half, as DartsMind keeps it,
  so it sits under the average rather than over it. The areas stretch to the
  chart's width, so their strokes do not scale and the dots, the tags and the
  day names are HTML on top.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { fill, useStrings } from '../../i18n/index.js';
import { PATHS } from '../../router/paths.js';

export interface LegPoint {
  /** The match the leg was played in, to open it in the history. */
  matchId: string;
  /** When it was played: the player's last dart of it. */
  at: number;
  average: number;
  /** 0–100, or null when no double was thrown at. */
  checkoutPercent: number | null;
}

const props = defineProps<{
  points: LegPoint[];
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
/** Room at either end, so the first and last legs' dots are whole. */
const INSET = 6;
/** A day narrower than this, in pixels, goes unnamed: its name would not fit. */
const NAMED_DAY_PX = 40;

// How wide the chart is on screen, for which days have room for a name; a
// phone's width until it is measured.
const plot = ref<HTMLElement | null>(null);
const plotWidth = ref(320);
let watcher: ResizeObserver | null = null;
onMounted(() => {
  if (!plot.value || typeof ResizeObserver === 'undefined') return;
  watcher = new ResizeObserver(([entry]) => entry && (plotWidth.value = entry.contentRect.width));
  watcher.observe(plot.value);
});
onBeforeUnmount(() => watcher?.disconnect());

const selected = ref(props.points.length - 1);
// A new player or period: the latest leg again.
watch(
  () => props.points,
  (points) => (selected.value = points.length - 1),
);
const index = computed(() => Math.min(Math.max(selected.value, 0), props.points.length - 1));
const point = computed(() => props.points[index.value]!);

const two = (n: number) => String(n).padStart(2, '0');
const dayOf = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}/${two(d.getMonth() + 1)}/${two(d.getDate())}`;
};
const timeOf = (at: number) => {
  const d = new Date(at);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
};

const chart = computed(() => {
  const { points } = props;
  const top = Math.max(...points.map((p) => p.average), props.reference, 1) * HEADROOM;
  const x = (i: number) => (points.length === 1 ? W / 2 : INSET + (i / (points.length - 1)) * (W - 2 * INSET));
  const yAverage = (value: number) => H - (value / top) * H;
  const yCheckout = (value: number | null) => H - ((value ?? 0) / 100) * H * CHECKOUT_SHARE;
  // Flat out to the edges from the first and last legs.
  const area = (y: (p: LegPoint) => number) =>
    `M0 ${H} L0 ${y(points[0]!)} ${points.map((p, i) => `L${x(i)} ${y(p)}`).join(' ')} L${W} ${y(points.at(-1)!)} L${W} ${H} Z`;
  const line = (y: (p: LegPoint) => number) =>
    `M0 ${y(points[0]!)} ${points.map((p, i) => `L${x(i)} ${y(p)}`).join(' ')} L${W} ${y(points.at(-1)!)}`;

  // The days, as runs of legs played on the same one. Each reaches halfway to
  // its neighbours, so together they cover the chart edge to edge.
  const days: { from: number; to: number; name: string; shaded: boolean }[] = [];
  points.forEach((p, i) => {
    const name = dayOf(p.at);
    const last = days.at(-1);
    if (last && last.name === name) last.to = i;
    else days.push({ from: i, to: i, name, shaded: days.length % 2 === 1 });
  });
  const bands = days.map((day, n) => {
    const left = n === 0 ? 0 : (x(day.from - 1) + x(day.from)) / 2;
    const right = n === days.length - 1 ? W : (x(day.to) + x(day.to + 1)) / 2;
    return { ...day, left, right, named: ((right - left) / W) * plotWidth.value >= NAMED_DAY_PX };
  });

  return {
    x,
    yAverage,
    yCheckout,
    bands,
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
/** The day's name, short: the year is in the cursor's tag. */
const shortDay = (name: string) => name.slice(5);

const cursorX = computed(() => chart.value.x(index.value));
/** The tags sit beside the cursor, on whichever side has the room. */
const tagsOnLeft = computed(() => cursorX.value > W * 0.6);

const shown = computed(() => ({
  date: dayOf(point.value.at),
  time: timeOf(point.value.at),
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

// The cursor is out only while it is being used.
const hovering = ref(false);
const dragging = ref(false);
/** The slider held, or moved by keys: not merely focused by a click. */
const sliding = ref(false);
const picking = computed(() => hovering.value || dragging.value || sliding.value);

// Dragging, or a mouse passing over: the nearest leg to the pointer.
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
  if (event.pointerType === 'mouse') hovering.value = true;
  if (dragging.value || event.pointerType === 'mouse') pick(event);
}
function release() {
  dragging.value = false;
}
</script>

<template>
  <figure class="leg-trend">
    <figcaption class="leg-trend-head">
      <span>{{ fill(t.stats.trendFrom, { n: points.length }) }}</span>
      <span class="leg-trend-legend" aria-hidden="true">
        <span class="leg-trend-key leg-trend-key-average">{{ t.stats.trendAverage }}</span>
        <span class="leg-trend-key leg-trend-key-checkout">{{ t.stats.trendCheckout }}</span>
      </span>
    </figcaption>

    <div
      ref="plot"
      :class="['leg-trend-plot', { 'leg-trend-picking': picking }]"
      aria-hidden="true"
      @pointerdown="press"
      @pointermove="move"
      @pointerup="release"
      @pointercancel="release"
      @pointerleave="hovering = false"
    >
      <span
        v-for="band in chart.bands"
        :key="band.name"
        :class="['leg-trend-day', { 'leg-trend-day-shaded': band.shaded }]"
        :style="{ left: left(band.left), width: left(band.right - band.left) }"
      />

      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
        <path class="leg-trend-area-average" :d="chart.averageArea" />
        <path class="leg-trend-line-average" :d="chart.averageLine" vector-effect="non-scaling-stroke" />
        <path class="leg-trend-area-checkout" :d="chart.checkoutArea" />
        <path class="leg-trend-line-checkout" :d="chart.checkoutLine" vector-effect="non-scaling-stroke" />
        <line
          class="leg-trend-reference"
          :x1="0"
          :y1="chart.referenceY"
          :x2="W"
          :y2="chart.referenceY"
          vector-effect="non-scaling-stroke"
        />
        <line
          v-if="picking"
          class="leg-trend-cursor"
          :x1="cursorX"
          :y1="0"
          :x2="cursorX"
          :y2="H"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <!-- Over the areas, so a name is never hidden under them. -->
      <template v-for="band in chart.bands" :key="`name-${band.name}`">
        <span
          v-if="band.named"
          class="leg-trend-day-name"
          :style="{ left: left((band.left + band.right) / 2) }"
        >{{ shortDay(band.name) }}</span>
      </template>
      <span class="leg-trend-reference-label" :style="{ top: down(chart.referenceY) }">{{ reference.toFixed(1) }}</span>
      <template v-if="picking">
        <span class="leg-trend-dot leg-trend-dot-average" :style="{ left: left(cursorX), top: down(chart.yAverage(point.average)) }" />
        <span
          class="leg-trend-dot leg-trend-dot-checkout"
          :style="{ left: left(cursorX), top: down(chart.yCheckout(point.checkoutPercent)) }"
        />
        <span
          class="leg-trend-tags"
          :style="tagsOnLeft ? { right: `calc(${100 - (cursorX / W) * 100}% + 8px)` } : { left: `calc(${left(cursorX)} + 8px)` }"
        >
          <span class="leg-trend-when">{{ shown.date }}<br />{{ shown.time }}</span>
          <span class="leg-trend-tag leg-trend-tag-average">{{ shown.average }}</span>
          <span class="leg-trend-tag leg-trend-tag-checkout">{{ shown.checkout }}</span>
        </span>
      </template>
    </div>

    <input
      v-model.number="selected"
      class="leg-trend-slider"
      type="range"
      min="0"
      :max="points.length - 1"
      step="1"
      :aria-label="t.stats.trendSlider"
      :aria-valuetext="readout"
      @pointerdown="sliding = true"
      @pointerup="sliding = false"
      @pointercancel="sliding = false"
      @keydown="sliding = true"
      @blur="sliding = false"
    />
    <p class="leg-trend-foot">
      <RouterLink :to="PATHS.match.replace(':id', point.matchId)">
        {{ fill(t.stats.trendOpen, { date: `${shown.date} ${shown.time}` }) }}
      </RouterLink>
    </p>
  </figure>
</template>
