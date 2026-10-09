<!--
  The pictures behind the lobby's menu, one per entry.

  Drawn in the app's own hand (lines in the text colour, the board's red and
  green where something points at the board or flows from it) so they sit with
  the mode chooser's drawings rather than looking bought in. They are
  decoration: the menu's words carry the meaning, and every picture is hidden
  from screen readers by the lobby.

  Movement is small and slow (a board turning, bars settling, waves), and all
  of it stops under prefers-reduced-motion (see the lobby's styles).
-->
<script setup lang="ts">
import Dartboard from '../Dartboard.vue';
import PairedModeArt from './PairedModeArt.vue';
import SoloModeArt from './SoloModeArt.vue';

export type LobbyArtKind = 'resume' | 'newGame' | 'pairAgain' | 'camera' | 'review' | 'history' | 'stats' | 'leave';

defineProps<{ kind: LobbyArtKind }>();

const LINE = { fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;
const HISTORY_ROWS = [0, 1, 2, 3];
const BARS = [46, 80, 128, 104, 62, 30];
const LANDED = [
  [-6, -52, 9],
  [4, -58, 7],
  [-14, -44, 6],
  [24, 20, 5],
  [-40, 30, 4],
] as const;
</script>

<template>
  <!-- A scoreboard mid-leg: the player to throw on a finish, the route in green. -->
  <svg v-if="kind === 'resume'" class="lobby-art-svg" viewBox="0 0 400 300">
    <rect v-bind="LINE" :x="40" :y="40" :width="150" :height="150" :rx="14" stroke="var(--accent)" />
    <rect v-bind="LINE" :x="210" :y="40" :width="150" :height="150" :rx="14" :opacity="0.45" />
    <text :x="115" :y="140" text-anchor="middle" :font-size="72" font-weight="700" fill="currentColor">40</text>
    <text :x="285" :y="140" text-anchor="middle" :font-size="72" font-weight="700" fill="currentColor" :opacity="0.45">87</text>
    <text :x="115" :y="174" text-anchor="middle" :font-size="20" font-weight="650" fill="var(--checkout)">D20</text>
    <g class="lobby-art-pulse">
      <rect v-bind="LINE" :x="40" :y="222" :width="56" :height="40" :rx="8" />
      <rect v-bind="LINE" :x="110" :y="222" :width="56" :height="40" :rx="8" :opacity="0.4" />
      <rect v-bind="LINE" :x="180" :y="222" :width="56" :height="40" :rx="8" :opacity="0.4" />
    </g>
    <text :x="68" :y="249" text-anchor="middle" :font-size="18" font-weight="650" fill="currentColor">T20</text>
  </svg>

  <div v-else-if="kind === 'newGame'" class="lobby-art-board">
    <Dartboard decorative />
  </div>

  <PairedModeArt v-else-if="kind === 'pairAgain'" />
  <SoloModeArt v-else-if="kind === 'camera'" />

  <!-- A photograph of the board from the side, with its darts marked. -->
  <svg v-else-if="kind === 'review'" class="lobby-art-svg" viewBox="0 0 400 300">
    <rect v-bind="LINE" :x="30" :y="30" :width="340" :height="240" :rx="14" :opacity="0.6" />
    <ellipse v-bind="LINE" :cx="200" :cy="150" :rx="120" :ry="80" :opacity="0.5" />
    <ellipse v-bind="LINE" :cx="200" :cy="150" :rx="78" :ry="52" :opacity="0.35" />
    <ellipse :cx="200" :cy="150" :rx="14" :ry="9" fill="var(--board-red)" :opacity="0.8" />
    <!-- Darts, flights towards the camera; the marks sit on the tips. -->
    <g stroke="currentColor" :stroke-width="3" stroke-linecap="round" :opacity="0.7">
      <line :x1="170" :y1="112" :x2="118" :y2="70" />
      <line :x1="238" :y1="160" :x2="300" :y2="118" />
    </g>
    <path d="M118 70 l-16 -4 l8 -10 z M300 118 l16 -2 l-8 -12 z" fill="var(--red-400)" />
    <g class="lobby-art-pulse" fill="none" :stroke-width="3">
      <circle :cx="170" :cy="112" :r="11" stroke="var(--accent)" />
      <circle :cx="238" :cy="160" :r="11" stroke="var(--green-300)" stroke-dasharray="5 4" />
    </g>
  </svg>

  <!-- Past matches, one under the other. -->
  <svg v-else-if="kind === 'history'" class="lobby-art-svg" viewBox="0 0 400 300">
    <g v-for="row in HISTORY_ROWS" :key="row" :transform="`translate(40 ${36 + row * 60})`" :opacity="1 - row * 0.2">
      <rect v-bind="LINE" :width="320" :height="46" :rx="10" />
      <line v-bind="LINE" :x1="20" :y1="18" :x2="150" :y2="18" :stroke-width="4" />
      <line v-bind="LINE" :x1="20" :y1="32" :x2="100" :y2="32" :stroke-width="2" :opacity="0.5" />
      <circle :cx="292" :cy="23" :r="9" :fill="row === 0 ? 'var(--green-400)' : 'none'" stroke="currentColor" :stroke-width="2" />
    </g>
  </svg>

  <!-- Where the darts land, and how the scores fall. -->
  <svg v-else-if="kind === 'stats'" class="lobby-art-svg" viewBox="0 0 400 300">
    <line v-bind="LINE" :x1="30" :y1="250" :x2="220" :y2="250" :opacity="0.5" />
    <rect
      v-for="(h, i) in BARS"
      :key="i"
      class="lobby-art-bar"
      :style="{ animationDelay: `${i * 80}ms` }"
      :x="40 + i * 30"
      :y="250 - h"
      :width="20"
      :height="h"
      :rx="4"
      :fill="i === 2 ? 'var(--green-400)' : 'currentColor'"
      :opacity="i === 2 ? 1 : 0.4"
    />
    <g transform="translate(305 150)">
      <circle v-bind="LINE" :r="72" :opacity="0.5" />
      <circle v-bind="LINE" :r="46" :opacity="0.35" />
      <circle v-bind="LINE" :r="10" :opacity="0.35" />
      <circle
        v-for="([x, y, r], i) in LANDED"
        :key="i"
        :cx="x"
        :cy="y"
        :r="r"
        :fill="i < 3 ? 'var(--red-400)' : 'var(--green-300)'"
        :opacity="0.85"
      />
    </g>
  </svg>

  <!-- A door, open, and the way out. -->
  <svg v-else class="lobby-art-svg" viewBox="0 0 400 300">
    <path v-bind="LINE" d="M150 40 h120 v220 h-120" :opacity="0.5" />
    <path v-bind="LINE" d="M150 40 l70 24 v176 l-70 20 z" />
    <circle :cx="205" :cy="152" :r="4" fill="currentColor" />
    <g v-bind="LINE" class="lobby-art-drift" stroke="var(--red-400)" :stroke-width="4">
      <line :x1="250" :y1="150" :x2="340" :y2="150" />
      <path d="M318 128 l24 22 l-24 22" />
    </g>
  </svg>
</template>
