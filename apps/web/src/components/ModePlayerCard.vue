<!--
  One player in a game other than X01 (issue #22), built like the X01 card
  (PlayerCard.vue) so the screen reads the same: the name and the legs on
  top, the big number (points, the target, the killer number) and what it is
  in a dark box beside it, and under it how far through the game they are, or
  their lives as pips. Out of the game, the card fades.
-->
<script setup lang="ts">
import { fill, useStrings } from '../i18n/index.js';
import type { ModeCard } from '../game/modeView.js';

withDefaults(defineProps<{ card: ModeCard; legsToWin: number; compact?: boolean }>(), { compact: false });

const t = useStrings();
</script>

<template>
  <article
    :class="['player-card', 'mode-card-player', { 'player-card-on': card.current, 'player-card-compact': compact, 'mode-card-out': card.out }]"
    :aria-current="card.current ? 'true' : undefined"
  >
    <div class="player-card-head">
      <span class="player-card-name">{{ card.name }}</span>
      <span v-if="card.badge" class="tag player-card-tag mode-card-badge">{{ card.badge }}</span>
      <span v-else-if="card.starts" class="tag player-card-tag">{{ t.game.throwsFirst }}</span>
      <span v-if="legsToWin > 1" class="player-card-legs" :aria-label="fill(t.game.legsOf, { n: card.legsWon, of: legsToWin })">
        {{ t.game.legs }}
        <span v-for="index in legsToWin" :key="index" :class="['pip', { 'pip-on': index <= card.legsWon }]" aria-hidden="true" />
      </span>
    </div>
    <div class="player-card-numbers">
      <span class="num player-card-left mode-card-value">{{ card.value }}</span>
      <span class="player-card-average mode-card-what">
        <span class="label">{{ card.label }}</span>
        <span v-if="card.pips" class="mode-card-lives" :aria-label="`${t.modes.play.lives}: ${card.pips.on}`">
          <span v-for="index in card.pips.of" :key="index" :class="['mode-life', { 'mode-life-on': index <= card.pips.on }]" aria-hidden="true" />
        </span>
        <span v-if="card.caption" class="mode-card-caption">{{ card.caption }}</span>
      </span>
    </div>
    <div v-if="card.progress !== null" class="mode-card-progress" aria-hidden="true">
      <span class="mode-card-progress-fill" :style="{ width: `${Math.round(card.progress * 100)}%` }" />
    </div>
  </article>
</template>
