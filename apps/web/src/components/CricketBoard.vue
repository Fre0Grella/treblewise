<!--
  The cricket board (issue #22), the way it is chalked up: the numbers down
  the middle, each player's marks on them (/ for one, X for two, a circled X
  for closed), and their points on top. The player at the oche has the beige
  column; a number everyone has closed is struck through, out of play.
-->
<script setup lang="ts">
import type { CricketState, PlayerConfig } from '@treblewise/core';
import { computed } from 'vue';

import { cricketRows } from '../game/modeView.js';
import { fill, useStrings } from '../i18n/index.js';

const props = defineProps<{
  players: readonly PlayerConfig[];
  state: CricketState | null;
  /** Whose throw it is, or who still holds the board. */
  current: string | null;
  starts: string | null;
  legsWon: Record<string, number>;
  legsToWin: number;
  /** Points are kept (not "no score"). */
  points: boolean;
}>();

const t = useStrings();
const ids = computed(() => props.players.map((player) => player.id));
const rows = computed(() => cricketRows(props.state, ids.value));
const markText = ['', '/', 'X', 'Ⓧ'];
const markWords = (n: number) => (n >= 3 ? t.modes.play.done : t.modes.play.marks(n));
</script>

<template>
  <section class="cricket" :style="{ '--cricket-players': players.length }" :aria-label="t.modes.names.cricket">
    <div class="cricket-row cricket-head">
      <span class="cricket-number" />
      <span
        v-for="player in players"
        :key="player.id"
        :class="['cricket-player', { 'cricket-on': current === player.id }]"
        :aria-current="current === player.id ? 'true' : undefined"
      >
        <span class="cricket-name">{{ player.name }}</span>
        <span v-if="points" class="num cricket-points">{{ state?.points[player.id] ?? 0 }}</span>
        <span v-if="legsToWin > 1" class="player-card-legs" :aria-label="fill(t.game.legsOf, { n: legsWon[player.id] ?? 0, of: legsToWin })">
          <span v-for="index in legsToWin" :key="index" :class="['pip', { 'pip-on': index <= (legsWon[player.id] ?? 0) }]" aria-hidden="true" />
        </span>
        <span v-else-if="starts === player.id" class="cricket-starts">{{ t.game.throwsFirst }}</span>
      </span>
    </div>
    <div v-for="row in rows" :key="row.n" :class="['cricket-row', { 'cricket-dead': row.closedByAll }]">
      <span class="num cricket-number">{{ row.label }}</span>
      <span
        v-for="(n, index) in row.marks"
        :key="ids[index]"
        :class="['cricket-cell', { 'cricket-on': current === ids[index], 'cricket-closed': n >= 3 }]"
        :aria-label="`${players[index]!.name}, ${row.label}: ${markWords(n)}`"
      >
        <span class="cricket-mark" aria-hidden="true">{{ markText[n] }}</span>
      </span>
    </div>
  </section>
</template>
