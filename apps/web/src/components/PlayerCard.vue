<!--
  One player in the match (issue #15): read from two or three metres away, so
  the score left is the biggest thing on the screen and the leg average the
  second. Under them, the leg visit by visit, a bar each.

  The player at the oche wears the beige card; the others stay dark. No
  pictures, no other numbers: they are at the end of the leg.

  With more than two players the cards are compact, so they share the
  column: the score, the bars and the average on one line, the bars half as
  tall, and the newest visits kept in sight when they run out of room. From
  four players on there are no bars at all: too many to read at a glance.
-->
<script setup lang="ts">
import { computed } from 'vue';

import { fill, useStrings } from '../i18n/index.js';

export interface VisitBar {
  score: number;
  bust: boolean;
  /** The visit being thrown, still filling. */
  live: boolean;
}

const props = withDefaults(
  defineProps<{
    name: string;
    remaining: number;
    legsWon: number;
    legsToWin: number;
    /** Sets won, when the match is played in sets. */
    setsWon?: number | null;
    /** Throws first in this leg. */
    starts?: boolean;
    /** At the oche (or still holding the board with their darts in it). */
    current?: boolean;
    /** The 3-dart average of the leg so far; null before a dart. */
    legAverage: number | null;
    /** The average's own colour against the player's usual one (#28); none is neutral. */
    averageColor?: string | null;
    /** How far from the usual average, in words ("▲ +2.3"). */
    averageNote?: string | null;
    /** The usual average, drawn across the bars; null for a guest or no history. */
    usual?: number | null;
    visits: readonly VisitBar[];
    /** One of more than two: the smaller card. */
    compact?: boolean;
    /** The leg's visits as bars; off from four players on. */
    showBars?: boolean;
  }>(),
  { setsWon: null, starts: false, current: false, averageColor: null, averageNote: null, usual: null, compact: false, showBars: true },
);

const t = useStrings();

/** A 180 is this many pixels tall. */
const fullBar = computed(() => (props.compact ? 44 : 96));
const barHeight = (score: number) => Math.round(6 + (score / 180) * fullBar.value);

const bars = computed(() =>
  props.visits.map((visit) => ({
    label: visit.bust ? 'B' : String(visit.score),
    height: visit.bust ? 6 : barHeight(visit.score),
    kind: visit.live ? 'live' : visit.bust ? 'bust' : visit.score >= 100 ? 'ton' : visit.score >= 60 ? 'good' : 'low',
  })),
);
const usualBottom = computed(() => (props.usual === null ? null : barHeight(props.usual)));
</script>

<template>
  <article :class="['player-card', { 'player-card-on': current, 'player-card-compact': compact }]" :aria-current="current ? 'true' : undefined">
    <div class="player-card-head">
      <span class="player-card-name">{{ name }}</span>
      <span v-if="starts" class="tag player-card-tag">{{ t.game.throwsFirst }}</span>
      <span class="player-card-legs" :aria-label="fill(t.game.legsOf, { n: legsWon, of: legsToWin })">
        <template v-if="setsWon !== null">{{ t.game.sets }} {{ setsWon }} · </template>
        {{ t.game.legs }}
        <span v-for="index in legsToWin" :key="index" :class="['pip', { 'pip-on': index <= legsWon }]" aria-hidden="true" />
      </span>
    </div>

    <div class="player-card-numbers">
      <span class="num player-card-left">{{ remaining }}</span>
      <span class="player-card-average">
        <span class="label">{{ t.game.legAverage }}</span>
        <span class="num player-card-average-value" :style="averageColor ? { color: averageColor } : undefined">
          {{ legAverage === null ? '–' : legAverage.toFixed(1) }}
        </span>
        <span v-if="averageNote" class="player-card-average-note" :style="averageColor ? { color: averageColor } : undefined">{{ averageNote }}</span>
      </span>
    </div>

    <div v-if="showBars" class="player-card-bars" :style="{ '--bar-max': `${fullBar + 6}px` }">
      <template v-if="usualBottom !== null && bars.length > 0">
        <span class="player-card-usual" :style="{ bottom: `calc(var(--bar-label) + ${usualBottom}px)` }" aria-hidden="true" />
        <span class="player-card-usual-label" :style="{ bottom: `calc(var(--bar-label) + ${usualBottom + 4}px)` }">
          {{ t.game.usual }} {{ usual!.toFixed(1) }}
        </span>
      </template>
      <span v-for="(bar, index) in bars" :key="index" class="visit-bar">
        <span :class="['visit-bar-fill', `visit-bar-${bar.kind}`]" :style="{ height: `${bar.height}px` }" />
        <span class="num visit-bar-label">{{ bar.label }}</span>
      </span>
      <span v-if="bars.length === 0" class="player-card-empty">{{ t.game.barsEmpty }}</span>
    </div>
  </article>
</template>
