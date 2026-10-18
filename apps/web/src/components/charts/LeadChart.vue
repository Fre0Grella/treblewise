<!--
  Who was ahead in a leg of two (issue #18): after every visit, the gap
  between what the two have left. Above the middle the first player leads,
  below it the second; where the line crosses, the lead changed hands. The
  biggest lead each way and the winning margin are written on it.

  The SVG stretches to its width, so the labels are HTML on top, placed in
  the chart's 600 × 320.
-->
<script setup lang="ts">
import { computed, useId } from 'vue';

import { fill, useStrings } from '../../i18n/index.js';

export interface LeadPoint {
  /** Who threw the visit: 0 or 1. */
  player: number;
  /** Points the first player is ahead by after it; below 0, the second leads. */
  lead: number;
}

const props = defineProps<{
  names: readonly [string, string];
  points: readonly LeadPoint[];
  /** The leg was won: the last point is the winning margin. */
  won: boolean;
}>();

const t = useStrings();
const uid = useId().replace(/[^a-zA-Z0-9-]/g, '');

const W = 600;
const H = 320;
const ZERO = 160;
const LEFT = 56;
const RIGHT = 584;
const SPAN = 136;

const top = computed(() => Math.max(100, Math.ceil(Math.max(0, ...props.points.map((p) => Math.abs(p.lead))) / 100) * 100));
const x = (k: number) => LEFT + (k / Math.max(1, props.points.length)) * (RIGHT - LEFT);
const y = (lead: number) => ZERO - (lead / top.value) * SPAN;

const line = computed(() => {
  const pts = [[x(0), y(0)], ...props.points.map((p, k) => [x(k + 1), y(p.lead)])];
  return 'M' + pts.map(([a, b]) => `${a!.toFixed(1)} ${b!.toFixed(1)}`).join('L');
});
const area = computed(() => `${line.value}L${x(props.points.length).toFixed(1)} ${ZERO}L${LEFT} ${ZERO}Z`);

const grid = computed(() =>
  [top.value, top.value / 2, 0, -top.value / 2, -top.value].map((v) => ({
    y: y(v),
    text: v === 0 ? t.game.level : `+${Math.abs(v)}`,
    side: v > 0 ? 'a' : v < 0 ? 'b' : null,
  })),
);

const dots = computed(() => props.points.map((p, k) => ({ x: x(k + 1), y: y(p.lead), side: p.player === 0 ? 'a' : 'b', delay: `${150 + k * 80}ms` })));

/** Placed over the chart: x and y in its 600 × 320, anchored at the start, middle or end. */
const at = (px: number, py: number, anchor: 'start' | 'middle' | 'end') => ({
  left: `${(px / W) * 100}%`,
  top: `${(py / H) * 100}%`,
  transform: `translate(${anchor === 'end' ? '-100%' : anchor === 'middle' ? '-50%' : '0'}, -50%)`,
});

const notes = computed(() => {
  const out: { text: string; side: string | null; style: Record<string, string> }[] = [];
  const all = props.points;
  if (all.length === 0) return out;
  // The biggest leads before the last visit: the last one is the margin.
  const before = props.won ? all.slice(0, -1) : all;
  if (before.length > 0) {
    let hi = 0;
    let lo = 0;
    before.forEach((p, k) => {
      if (p.lead > before[hi]!.lead) hi = k;
      if (p.lead < before[lo]!.lead) lo = k;
    });
    if (before[hi]!.lead > 0) out.push({ text: `${props.names[0]} +${before[hi]!.lead}`, side: 'a', style: at(x(hi + 1), y(before[hi]!.lead) - 28, 'middle') });
    if (before[lo]!.lead < 0) out.push({ text: `${props.names[1]} +${-before[lo]!.lead}`, side: 'b', style: at(x(lo + 1), y(before[lo]!.lead) + 38, 'middle') });
  }
  if (props.won) {
    const end = all.at(-1)!.lead;
    out.push({ text: fill(t.game.wonBy, { n: Math.abs(end) }), side: null, style: at(x(all.length), y(end) + (end >= 0 ? -28 : 38), 'end') });
  }
  return out;
});
</script>

<template>
  <figure class="lead">
    <div class="lead-plot">
      <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="t.game.leadChart">
        <defs>
          <clipPath :id="`${uid}-up`"><rect x="0" y="0" :width="W" :height="ZERO" /></clipPath>
          <clipPath :id="`${uid}-down`"><rect x="0" :y="ZERO" :width="W" :height="H" /></clipPath>
        </defs>
        <line v-for="g in grid" :key="g.y" class="lead-grid" :x1="LEFT" :x2="RIGHT + 6" :y1="g.y" :y2="g.y" />
        <path class="lead-area lead-a" :d="area" :clip-path="`url(#${uid}-up)`" />
        <path class="lead-area lead-b" :d="area" :clip-path="`url(#${uid}-down)`" />
        <path class="lead-line" :d="line" />
        <line class="lead-zero" :x1="LEFT" :x2="RIGHT + 6" :y1="ZERO" :y2="ZERO" />
        <circle v-for="(d, k) in dots" :key="k" :class="['lead-dot', `lead-${d.side}`]" :cx="d.x" :cy="d.y" r="5" :style="{ animationDelay: d.delay }" />
      </svg>
      <span v-for="g in grid" :key="`l${g.y}`" :class="['lead-label', 'lead-axis', g.side && `lead-${g.side}`]" :style="at(LEFT - 8, g.y, 'end')">{{ g.text }}</span>
      <span class="lead-label lead-who lead-a" :style="at(LEFT + 8, 26, 'start')">{{ fill(t.game.aheadUp, { name: names[0] }) }}</span>
      <span class="lead-label lead-who lead-b" :style="at(LEFT + 8, H - 20, 'start')">{{ fill(t.game.aheadDown, { name: names[1] }) }}</span>
      <span v-for="n in notes" :key="n.text" :class="['lead-label', 'lead-note', n.side && `lead-${n.side}`]" :style="n.style">{{ n.text }}</span>
    </div>
    <figcaption class="lead-caption">{{ t.game.leadNote }}</figcaption>
  </figure>
</template>
