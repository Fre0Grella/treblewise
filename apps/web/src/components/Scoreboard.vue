<!--
  The scoreboard. Read from two or three metres away in bad light, so the
  remaining score is the biggest thing on the screen and everything else is
  deliberately quiet.
-->
<script setup lang="ts">
import { formatRoute, matchStats, type MatchSnapshot } from '@treblewise/core';
import { computed } from 'vue';

import { useStrings } from '../i18n/index.js';

const props = withDefaults(
  defineProps<{
    snapshot: MatchSnapshot;
    /**
     * The player whose finished visit is still in the board: shown as the one
     * at the oche until the darts come out, although the score has moved on.
     */
    holding?: string | null;
  }>(),
  { holding: null },
);

const t = useStrings();

const cards = computed(() => {
  const { snapshot, holding } = props;
  const stats = matchStats(snapshot);
  const current = snapshot.current;
  const leg = snapshot.legs.at(-1);
  // Once a leg is won, every card shows the next leg's start score: the won
  // leg's zero (and the loser's remainder) belongs to the history, not to the
  // board everyone is about to throw at.
  const legOver = leg?.winnerId != null;
  return snapshot.config.players.map((player) => {
    const isNext = !holding && current?.playerId === player.id;
    const visit = [...(leg?.visits ?? [])].reverse().find((v) => v.playerId === player.id);
    return {
      player,
      isCurrent: holding ? holding === player.id : current?.playerId === player.id,
      remaining: isNext ? current!.remaining : legOver ? snapshot.config.startScore : (leg?.remaining[player.id] ?? snapshot.config.startScore),
      checkout: isNext && current!.checkout ? formatRoute(current!.checkout) : null,
      stats: stats[player.id]!,
      visit: visit ? (visit.busted ? t.game.busted : visit.darts.map((d) => d.hit.value).join(' · ')) : ' ',
    };
  });
});
</script>

<template>
  <div class="scoreboard">
    <div v-for="card in cards" :key="card.player.id" :class="['player', { 'player-current': card.isCurrent }]">
      <div class="player-head">
        <span class="player-name">{{ card.player.name }}</span>
        <span class="player-counts">
          <span v-if="snapshot.config.setsToWin > 1" :title="t.game.sets">{{ t.game.sets }} {{ snapshot.setsWon[card.player.id] ?? 0 }}</span>
          <span :title="t.game.legs">{{ t.game.legs }} {{ snapshot.legsWon[card.player.id] ?? 0 }}</span>
        </span>
      </div>

      <div class="player-remaining">{{ card.remaining }}</div>

      <div v-if="card.checkout" class="player-checkout" :title="t.game.chartNote">{{ card.checkout }}</div>

      <div class="player-meta">
        <span>{{ t.game.average }} <b>{{ card.stats.average.toFixed(1) }}</b></span>
        <span>{{ t.game.darts }} <b>{{ card.stats.dartsThrown }}</b></span>
        <span v-if="card.stats.checkoutPercent !== null">
          {{ t.game.checkoutPercent }} <b>{{ card.stats.checkoutPercent.toFixed(0) }}%</b>
        </span>
      </div>

      <div class="player-visit">{{ card.visit }}</div>
    </div>
  </div>
</template>
