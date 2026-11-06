<!--
  How a game is played (issue #22), over whatever is behind it: the goal in
  a sentence, then the rules a step at a time. Opened from the info button on
  a game's tile in the setup, and from "How to play" in the game's menu.
  Escape, the scrim or the button closes it.
-->
<script setup lang="ts">
import type { GameMode } from '@treblewise/core';
import { onMounted, onUnmounted, ref } from 'vue';

import { fill, useStrings } from '../i18n/index.js';
import Icon from './ui/Icon.vue';

const props = defineProps<{ mode: GameMode }>();
const emit = defineEmits<{ close: [] }>();

const t = useStrings();
const done = ref<HTMLButtonElement | null>(null);
const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close');
};
onMounted(() => {
  window.addEventListener('keydown', onKey);
  done.value?.focus();
});
onUnmounted(() => window.removeEventListener('keydown', onKey));

const title = fill(t.modes.howToPlay, { name: t.modes.names[props.mode] });
const rules = t.modes.rules[props.mode];
</script>

<template>
  <div class="overlay mode-rules-overlay" @click.self="emit('close')">
    <div class="mode-rules" role="dialog" aria-modal="true" :aria-label="title">
      <div class="mode-rules-head">
        <h2>{{ title }}</h2>
        <button type="button" class="btn-quiet btn-icon" :aria-label="t.modes.rulesCloseIcon" @click="emit('close')">
          <Icon name="close" />
        </button>
      </div>
      <p class="mode-rules-goal">{{ rules.goal }}</p>
      <ol class="mode-rules-list">
        <li v-for="step in rules.how" :key="step">{{ step }}</li>
      </ol>
      <p v-if="mode !== 'x01'" class="hint">{{ t.modes.rulesSettings }}</p>
      <button ref="done" type="button" class="btn-primary mode-rules-done" @click="emit('close')">{{ t.modes.rulesClose }}</button>
    </div>
  </div>
</template>
