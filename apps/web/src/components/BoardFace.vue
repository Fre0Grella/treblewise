<!--
  The board itself, drawn once for every place it appears: the game's
  dartboard, the statistics maps and the board of targets. Board millimetres,
  the bull at the origin, y flipped for the screen (dartboardGeometry.ts).

  `dim` fades the beds, for a map drawn over them; `fills` paints beds of its
  own colour (by bed key, or `bull`), for a board coloured by a statistic.
  Each bed carries its number as `data-sector` (25 the bull), so a board that
  is tapped can tell which number was meant.
-->
<script setup lang="ts">
import { BOARD } from '@treblewise/core';

import { COLOURS, R, buildBeds, numberPositions } from './dartboardGeometry.js';

withDefaults(
  defineProps<{
    /** The numbers round the board; a decoration has none. */
    numbers?: boolean;
    numberSize?: number;
    /** The beds' opacity: 1 for the board as it is, less under a map. */
    dim?: number;
    /** Beds painted their own colour, by key (`t-20`, `d-5`, … `bull`). */
    fills?: Readonly<Record<string, string>> | null;
  }>(),
  { numbers: true, numberSize: 26, dim: 1, fills: null },
);

const beds = buildBeds();
const positions = numberPositions();
</script>

<template>
  <g>
    <circle :cx="0" :cy="0" :r="R" :fill="COLOURS.surround" />
    <g :stroke="COLOURS.wire" :stroke-width="0.8" :opacity="dim">
      <path v-for="b in beds" :key="b.key" :d="b.d" :fill="fills?.[b.key] ?? b.fill" :data-sector="b.sector" />
      <circle :cx="0" :cy="0" :r="BOARD.outerBullRadius" :fill="fills?.bull ?? COLOURS.green" data-sector="25" />
      <circle :cx="0" :cy="0" :r="BOARD.bullRadius" :fill="fills?.bull ?? COLOURS.red" data-sector="25" />
    </g>
    <g v-if="numbers" :fill="COLOURS.number" :font-size="numberSize" font-weight="600" text-anchor="middle">
      <text v-for="n in positions" :key="n.sector" :x="n.x" :y="n.y + numberSize * 0.35">{{ n.sector }}</text>
    </g>
  </g>
</template>
