<!--
  The game's address (/game): X01 on its own screen, every other game
  (issue #22) on the screen built for them.
-->
<script setup lang="ts">
import { isX01 } from '@treblewise/core';
import { computed } from 'vue';

import { useMatchesStore } from '../store/stores.js';
import Game from './Game.vue';
import ModeGame from './ModeGame.vue';

const matches = useMatchesStore();
const x01 = computed(() => !matches.match || isX01(matches.match.config));
</script>

<template>
  <Game v-if="x01" />
  <ModeGame v-else />
</template>
