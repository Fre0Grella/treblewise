<!--
  One dart of the visit (issue #15). When it goes in, the card zooms from the
  whole board to where it landed in about 0.4 s and a band slides up naming it
  in notation (T20, never 60), its points small beside. A dart entered on the
  keypad has no place: the card zooms less and lights its whole bed.

  Empty, the slot waits for the next dart, pulsing at its own pace, and shows
  where a checkout route says to aim. Pressing a dart picks it to correct.
-->
<script setup lang="ts">
import { BOARD, formatHit, targetPoint, type Hit, type Point } from '@treblewise/core';
import { computed } from 'vue';

import { useStrings } from '../i18n/index.js';
import { COLOURS, R, buildBeds, numberPositions } from './dartboardGeometry.js';

export interface CardDart {
  id: string;
  hit: Hit;
  pos?: Point;
  /** Where it came from, as the dart says it ('auto' is the autoscorer). */
  source?: string;
  corrected?: boolean;
  /** The dart that bust its visit. */
  bust?: boolean;
}

const props = withDefaults(
  defineProps<{
    /** The dart in this slot, or nothing yet. */
    dart: CardDart | null;
    index: number;
    picked?: boolean;
    /** For an empty slot: where the checkout route aims this dart. */
    aim?: Hit | null;
    /** For an empty slot: a dart is expected here now. */
    waiting?: boolean;
    /** What the waiting slot says. */
    waitingText?: string;
  }>(),
  { picked: false, aim: null, waiting: false, waitingText: '' },
);
defineEmits<{ pick: [] }>();

const t = useStrings();
const beds = buildBeds();
const numbers = numberPositions();

/** Where the card zooms to, in SVG space, and how far. */
const focus = computed(() => {
  const dart = props.dart;
  if (!dart) return null;
  const point = dart.pos ?? (dart.hit.ring === 'miss' ? { x: 0, y: BOARD.boardRadius - 8 } : targetPoint(dart.hit));
  return { x: point.x, y: -point.y, scale: dart.pos ? 3.4 : 2.3 };
});

/** The whole bed of a keypad dart, to light. */
const bedKeys = computed(() => {
  const hit = props.dart?.hit;
  if (!hit || props.dart?.pos) return [];
  if (hit.ring === 'treble') return [`t-${hit.sector}`];
  if (hit.ring === 'double') return [`d-${hit.sector}`];
  if (hit.ring === 'single') return [`s-in-${hit.sector}`, `s-out-${hit.sector}`];
  return [];
});
const litBeds = computed(() => beds.filter((bed) => bedKeys.value.includes(bed.key)));
const litBull = computed(() => (props.dart && !props.dart.pos ? props.dart.hit.ring : null));

const source = computed(() => {
  const dart = props.dart;
  if (!dart) return '';
  if (dart.corrected) return t.game.corrected;
  return dart.source === 'auto' ? t.game.byCamera : t.game.byHand;
});
</script>

<template>
  <button
    v-if="dart && focus"
    type="button"
    :class="['dart-card', { 'dart-card-picked': picked, 'dart-card-bust': dart.bust }]"
    :aria-label="`${index + 1}: ${formatHit(dart.hit)}. ${t.game.correctHint}`"
    :aria-pressed="picked"
    @click="$emit('pick')"
  >
    <svg class="dart-card-board" :viewBox="`${-R} ${-R} ${2 * R} ${2 * R}`" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <!-- Keyed by the dart, so a new dart (or a corrected one) zooms in again. -->
      <g :key="`${dart.id}-${dart.hit.ring}-${dart.hit.value}`" class="dart-card-zoom" :style="{ transform: `scale(${focus.scale}) translate(${-focus.x}px, ${-focus.y}px)` }">
        <circle :r="R" :fill="COLOURS.surround" />
        <g :stroke="COLOURS.wire" :stroke-width="0.8">
          <path v-for="b in beds" :key="b.key" :d="b.d" :fill="b.fill" />
          <circle :r="BOARD.outerBullRadius" :fill="COLOURS.green" />
          <circle :r="BOARD.bullRadius" :fill="COLOURS.red" />
        </g>
        <g :fill="COLOURS.number" :font-size="26" font-weight="600" text-anchor="middle">
          <text v-for="n in numbers" :key="n.sector" :x="n.x" :y="n.y + 9">{{ n.sector }}</text>
        </g>
        <path v-for="b in litBeds" :key="b.key" class="dart-card-lit" :d="b.d" />
        <circle v-if="litBull === 'outerBull'" class="dart-card-lit" :r="BOARD.outerBullRadius" />
        <circle v-if="litBull === 'bull'" class="dart-card-lit" :r="BOARD.bullRadius" />
        <circle v-if="dart.pos" class="dart-card-mark" :cx="dart.pos.x" :cy="-dart.pos.y" :r="3.6" />
      </g>
    </svg>
    <span class="dart-card-band">
      <span class="num dart-card-hit">{{ formatHit(dart.hit) }}</span>
      <span class="dart-card-meta">
        <span>{{ dart.bust ? t.game.busted : `${dart.hit.value} ${t.game.points}` }}</span>
        <span>{{ source }}</span>
      </span>
    </span>
  </button>

  <div v-else class="dart-slot" :aria-label="`${index + 1}`">
    <template v-if="aim">
      <span class="dart-slot-aim-label">{{ t.game.aim }}</span>
      <span class="num dart-slot-aim">{{ formatHit(aim) }}</span>
    </template>
    <span v-if="waiting" :class="['dart-slot-wait', `dart-slot-wait-${index}`, { 'dart-slot-wait-small': aim }]">{{ waitingText }}</span>
    <span v-else-if="!aim" class="dart-slot-none" aria-hidden="true">—</span>
  </div>
</template>
