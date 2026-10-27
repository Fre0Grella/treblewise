<!--
  The board drawn over the camera image.

  Everything here works in image pixels, with the SVG's viewBox set to the
  frame's own resolution, so a coordinate on screen is a coordinate in the
  photograph regardless of how the video is scaled to fit the phone.

  Drawing the board's wires through the calibration is what makes a
  calibration checkable by eye: if the drawn wires sit on the real ones, the
  homography is right, and if they drift the person can see exactly where.

  A calibration marker has to sit on the double wire to a millimetre, and a
  whole frame on a laptop shows a millimetre of board as half a screen pixel:
  markers placed by eye were 3 to 6 mm out, which put the treble ring a band
  away from where it is. So a marker moves by as much as the finger does,
  rather than jumping under it, and while it is dragged a lens shows the
  photograph around it magnified, with the board drawn over it.
-->
<script setup lang="ts">
import { applyHomography, boardWireframe, type Matrix3, type Point } from '@treblewise/core';
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';

export interface OverlayHandle {
  point: Point;
  label: string;
  hint: string;
}

/**
 * A dart's mark, already in image pixels. `kind` tells a person's marks
 * apart: in the board since an earlier photograph (grey), placed on this one
 * (yellow), or proposed by the model and not yet confirmed (blue, dashed).
 */
export interface OverlayDart {
  img: Point;
  label: string;
  active?: boolean;
  kind?: 'inBoard' | 'new' | 'proposed';
}

const props = withDefaults(
  defineProps<{
    /** The frame's own resolution; the SVG viewBox. */
    width: number;
    height: number;
    /** Board millimetres → image pixels. Draws the wireframe when present. */
    toImage?: Matrix3 | null;
    /** Draggable calibration landmarks. */
    handles?: OverlayHandle[];
    onHandleMove?: (index: number, point: Point) => void;
    darts?: OverlayDart[];
    onDartMove?: (index: number, point: Point) => void;
    /** Tapping empty space, in image pixels. */
    onTap?: (point: Point) => void;
    dim?: boolean;
    /** The photograph under the overlay: given, a marker being dragged shows it magnified in a lens. */
    lensSrc?: string | null;
  }>(),
  { toImage: null, handles: () => [], darts: () => [], dim: false, lensSrc: null },
);

/** The overlay's colours live in global.css, with the rest of the palette. */
const MARK_COLOUR = {
  inBoard: 'var(--mark-in-board)',
  new: 'var(--mark-new)',
  proposed: 'var(--mark-proposed)',
  plain: 'var(--mark-ink)',
} as const;

const svg = ref<SVGSVGElement | null>(null);
let drag: { kind: 'handle' | 'dart'; index: number } | null = null;
/** From the finger to the marker it grabbed: the marker moves with the finger, not under it. */
let grab: Point = { x: 0, y: 0 };
/** The marker being dragged, for the lens. */
const dragged = ref<number | null>(null);
// Unique per instance: two overlays on one page would otherwise share a lens clip.
const clipId = `overlay-lens-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;

// A phone reports a finger a hundred and more times a second, and every report
// re-renders the screen that owns the markers. Only the latest position
// matters, so moves are handed on once per frame.
let pendingMove: { kind: 'handle' | 'dart'; index: number; point: Point } | null = null;
let moveFrame = 0;
function flushMove() {
  if (moveFrame) cancelAnimationFrame(moveFrame);
  moveFrame = 0;
  const move = pendingMove;
  pendingMove = null;
  if (!move) return;
  if (move.kind === 'handle') props.onHandleMove?.(move.index, move.point);
  else props.onDartMove?.(move.index, move.point);
}

// The board's wires, projected into the photograph.
const wires = computed(() => {
  const toImage = props.toImage;
  if (!toImage) return [];
  return boardWireframe().map((line) =>
    line
      .map((p) => applyHomography(toImage, p))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' '),
  );
});

// Markers are drawn at a fixed size on screen, not in image pixels: the
// picture is shown at very different scales (a whole phone frame, or the
// board's square magnified on a laptop), and a marker that grew with it hid
// the very tip it was meant to sit on. `scale` is screen pixels per image
// pixel; until the overlay has been measured, a hundredth of the frame stands
// in for six screen pixels.
const scale = ref(0);
let observer: ResizeObserver | null = null;
function measure() {
  const rect = svg.value?.getBoundingClientRect();
  if (rect && rect.width > 0 && props.width > 0) scale.value = rect.width / props.width;
}
onMounted(() => {
  if (!svg.value || typeof ResizeObserver === 'undefined') return;
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(svg.value);
});
watch(() => props.width, measure);
onBeforeUnmount(() => {
  observer?.disconnect();
  cancelAnimationFrame(moveFrame);
});

/** A length in screen pixels, as image pixels. */
const px = (n: number) => (scale.value > 0 ? n / scale.value : (n * Math.max(props.width, props.height)) / 600);
const unit = computed(() => px(6));

/** The lens's radius, in screen pixels. */
const LENS_RADIUS = 72;
/** Screen pixels per image pixel in the lens: about four per millimetre of board, on the usual setup. */
const LENS_DETAIL = 4;

/**
 * The lens over a marker being dragged: above it, clear of the finger, or
 * below it when there is no room above; its centre shows the marker's point.
 */
const lens = computed(() => {
  const index = dragged.value;
  const at = index === null ? undefined : props.handles[index]?.point;
  if (!at || !props.lensSrc) return null;
  const radius = px(LENS_RADIUS);
  const gap = px(28);
  const magnification = Math.min(12, Math.max(2, LENS_DETAIL * px(1)));
  const above = at.y - 2 * radius - gap > 0;
  const cx = Math.min(Math.max(at.x, radius), props.width - radius);
  const cy = above ? at.y - radius - gap : at.y + radius + gap;
  return {
    cx,
    cy,
    radius,
    magnification,
    transform: `translate(${cx} ${cy}) scale(${magnification}) translate(${-at.x} ${-at.y})`,
  };
});

function toImageSpace(event: PointerEvent): Point | null {
  const rect = svg.value?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return null;
  return {
    x: ((event.clientX - rect.left) / rect.width) * props.width,
    y: ((event.clientY - rect.top) / rect.height) * props.height,
  };
}

function down(event: PointerEvent) {
  const point = toImageSpace(event);
  if (!point) return;

  // Grab the marker under the finger, if any: the nearest one, except that a
  // mark of this photograph (new or proposed) wins over one in the board since
  // an earlier photograph. Two darts in a tight group sit within a finger of
  // each other, and the one being placed is the one that needs moving.
  const reach = px(24);
  const near = (candidates: { img: Point; kind?: string }[]) => {
    let best = -1;
    let bestRank = Infinity;
    candidates.forEach((candidate, index) => {
      const distance = Math.hypot(candidate.img.x - point.x, candidate.img.y - point.y);
      if (distance >= reach) return;
      const rank = (candidate.kind === 'inBoard' ? reach : 0) + distance;
      if (rank < bestRank) {
        best = index;
        bestRank = rank;
      }
    });
    return best;
  };

  const handleIndex = near(props.handles.map((handle) => ({ img: handle.point })));
  if (handleIndex >= 0 && props.onHandleMove) {
    drag = { kind: 'handle', index: handleIndex };
    const at = props.handles[handleIndex]!.point;
    grab = { x: at.x - point.x, y: at.y - point.y };
    dragged.value = handleIndex;
  } else {
    const dartIndex = near(props.darts);
    drag = dartIndex >= 0 && props.onDartMove ? { kind: 'dart', index: dartIndex } : null;
  }
  if (drag) (event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId);
}

function move(event: PointerEvent) {
  if (!drag) return;
  const finger = toImageSpace(event);
  if (!finger) return;
  const point = drag.kind === 'handle' ? { x: finger.x + grab.x, y: finger.y + grab.y } : finger;
  pendingMove = { kind: drag.kind, index: drag.index, point };
  if (!moveFrame) moveFrame = requestAnimationFrame(flushMove);
}

function up(event: PointerEvent) {
  const wasDragging = drag !== null;
  drag = null;
  dragged.value = null;
  flushMove(); // the marker ends where the finger left it, not one frame short
  if (wasDragging) return;
  const point = toImageSpace(event);
  if (point) props.onTap?.(point);
}

function cancel() {
  drag = null;
  dragged.value = null;
}

/** A thin cross with a gap in the middle, so the tip itself stays visible under the mark: placing it is lining the gap up on the tip. */
function ticks({ x, y }: Point) {
  return [
    [x - px(12), y, x - px(3), y],
    [x + px(3), y, x + px(12), y],
    [x, y - px(12), x, y - px(3)],
    [x, y + px(3), x, y + px(12)],
  ] as const;
}
</script>

<template>
  <svg
    ref="svg"
    :class="['board-overlay', { 'board-overlay-dim': dim }]"
    :viewBox="`0 0 ${width} ${height}`"
    preserveAspectRatio="none"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="cancel"
  >
    <g fill="none" stroke="var(--overlay-wire)" :stroke-width="px(1)" :opacity="0.85">
      <polyline v-for="(points, index) in wires" :key="index" :points="points" />
    </g>

    <g v-for="handle in handles" :key="handle.label">
      <circle :cx="handle.point.x" :cy="handle.point.y" :r="unit * 2.4" fill="var(--overlay-handle-fill)" stroke="var(--overlay-handle)" :stroke-width="unit * 0.3" />
      <circle :cx="handle.point.x" :cy="handle.point.y" :r="unit * 0.35" fill="var(--overlay-handle)" />
      <text
        :x="handle.point.x"
        :y="handle.point.y - unit * 3"
        fill="var(--overlay-handle)"
        :font-size="unit * 2.4"
        font-weight="700"
        text-anchor="middle"
        paint-order="stroke"
        stroke="var(--mark-shade)"
        :stroke-width="unit * 0.5"
      >
        {{ handle.label }}
      </text>
    </g>

    <g v-for="(dart, index) in darts" :key="index">
      <line v-for="([x1, y1, x2, y2], tick) in ticks(dart.img)" :key="`halo-${tick}`" :x1="x1" :y1="y1" :x2="x2" :y2="y2" stroke="var(--mark-shade-soft)" :stroke-width="px(2.5)" />
      <line v-for="([x1, y1, x2, y2], tick) in ticks(dart.img)" :key="tick" :x1="x1" :y1="y1" :x2="x2" :y2="y2" stroke="var(--mark-ink)" :stroke-width="px(1)" />
      <circle
        :cx="dart.img.x"
        :cy="dart.img.y"
        :r="px(8)"
        fill="none"
        :stroke="MARK_COLOUR[dart.kind ?? (dart.active ? 'new' : 'plain')]"
        :stroke-width="px(1.5)"
        :stroke-dasharray="dart.kind === 'proposed' ? `${px(3)} ${px(2)}` : undefined"
      />
      <!-- Staggered, because three darts in a cluster put their labels on top of each other otherwise. -->
      <text
        :x="dart.img.x"
        :y="dart.img.y - px(15) - index * px(13)"
        fill="var(--mark-ink)"
        :font-size="px(12)"
        font-weight="700"
        text-anchor="middle"
        paint-order="stroke"
        stroke="var(--mark-shade)"
        :stroke-width="px(3)"
      >
        {{ dart.label }}
      </text>
    </g>

    <g v-if="lens" class="board-overlay-lens" pointer-events="none">
      <clipPath :id="clipId">
        <circle :cx="lens.cx" :cy="lens.cy" :r="lens.radius" />
      </clipPath>
      <circle :cx="lens.cx" :cy="lens.cy" :r="lens.radius + px(2)" fill="var(--mark-shade-strong)" stroke="var(--overlay-handle)" :stroke-width="px(2)" />
      <g :clip-path="`url(#${clipId})`">
        <g :transform="lens.transform">
          <image :href="lensSrc ?? undefined" x="0" y="0" :width="width" :height="height" preserveAspectRatio="none" />
          <g fill="none" stroke="var(--overlay-wire)" :stroke-width="px(1) / lens.magnification" :opacity="0.85">
            <polyline v-for="(points, index) in wires" :key="index" :points="points" />
          </g>
        </g>
        <!-- The marker's point is the lens's centre, left clear so the wire under it shows. -->
        <g stroke="var(--overlay-handle)" :stroke-width="px(1.5)">
          <line :x1="lens.cx - lens.radius" :y1="lens.cy" :x2="lens.cx - px(6)" :y2="lens.cy" />
          <line :x1="lens.cx + px(6)" :y1="lens.cy" :x2="lens.cx + lens.radius" :y2="lens.cy" />
          <line :x1="lens.cx" :y1="lens.cy - lens.radius" :x2="lens.cx" :y2="lens.cy - px(6)" />
          <line :x1="lens.cx" :y1="lens.cy + px(6)" :x2="lens.cx" :y2="lens.cy + lens.radius" />
        </g>
      </g>
    </g>
  </svg>
</template>
