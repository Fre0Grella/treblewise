<!--
  Players' numbers side by side, broadcast style: the label in the middle, a
  value at each end, the better one lit, and a two-sided bar under it showing
  how the two compare. Used at the end of a leg and for a past match. With
  more than two players there is no "side": the numbers go in columns.
-->
<script setup lang="ts">
import { computed } from 'vue';

export interface HeadToHeadRow {
  label: string;
  /** One per player, in the players' order; null when there is nothing yet. */
  values: (number | null)[];
  /** How each value is written. */
  texts: string[];
  /** Which way is better; null when neither is (a count of darts, say). */
  higherIsBetter?: boolean | null;
  /** A colour of its own for a value (the leg average against the usual one). */
  colors?: (string | null)[];
}

const props = defineProps<{
  players: readonly { id: string; name: string }[];
  rows: readonly HeadToHeadRow[];
  /** The word between the two names: "Leg 3", "Match". */
  caption: string;
}>();

const sides = computed(() => props.players.length === 2);

const shown = computed(() =>
  props.rows.map((row) => {
    const [a, b] = [row.values[0] ?? null, row.values[1] ?? null];
    const better =
      row.higherIsBetter == null || a === null || b === null || a === b ? 0 : (a > b) === row.higherIsBetter ? -1 : 1;
    const total = (a ?? 0) + (b ?? 0);
    const share = total > 0 ? Math.max(8, Math.min(92, ((a ?? 0) / total) * 100)) : 50;
    return {
      ...row,
      aClass: { 'h2h-better': better === -1 },
      bClass: { 'h2h-better': better === 1 },
      aBar: { flexBasis: `${share}%` },
      aBarOn: better === -1,
      bBarOn: better === 1,
    };
  }),
);
</script>

<template>
  <div class="h2h">
    <template v-if="sides">
      <div class="h2h-head">
        <span>{{ players[0]!.name }}</span>
        <span class="h2h-caption">{{ caption }}</span>
        <span class="h2h-right">{{ players[1]!.name }}</span>
      </div>
      <div v-for="row in shown" :key="row.label" class="h2h-row">
        <div class="h2h-line">
          <span :class="['num', 'h2h-value', row.aClass]" :style="row.colors?.[0] ? { color: row.colors[0] } : undefined">{{ row.texts[0] }}</span>
          <span class="h2h-label">{{ row.label }}</span>
          <span :class="['num', 'h2h-value', 'h2h-right', row.bClass]" :style="row.colors?.[1] ? { color: row.colors[1] } : undefined">{{ row.texts[1] }}</span>
        </div>
        <div class="h2h-bar" aria-hidden="true">
          <span :class="{ 'h2h-bar-on': row.aBarOn }" :style="row.aBar" />
          <span :class="{ 'h2h-bar-on': row.bBarOn }" />
        </div>
      </div>
    </template>

    <table v-else class="h2h-table">
      <thead>
        <tr>
          <th>{{ caption }}</th>
          <th v-for="player in players" :key="player.id">{{ player.name }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.label">
          <th scope="row">{{ row.label }}</th>
          <td v-for="(text, index) in row.texts" :key="index" class="num">{{ text }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
