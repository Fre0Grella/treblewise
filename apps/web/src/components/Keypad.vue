<!--
  Keypad entry, dart by dart, for when tapping the board is not wanted: a dart
  recorded this way has a score but no position, and the statistics layer
  knows the difference.

  Single, double or treble first (it falls back to single after each dart),
  then the number; 25, bull and miss always work, whatever is chosen. The key
  for the checkout route's next dart is outlined (issue #15).
-->
<script setup lang="ts">
import { BULL, MISS, OUTER_BULL, hit, type Hit } from '@treblewise/core';
import { computed, ref } from 'vue';

import { useStrings } from '../i18n/index.js';
import Segmented from './ui/Segmented.vue';

type Multiplier = 'single' | 'double' | 'treble';

const props = withDefaults(defineProps<{ disabled?: boolean; aim?: Hit | null }>(), { disabled: false, aim: null });
const emit = defineEmits<{ hit: [hit: Hit] }>();

const SECTORS = Array.from({ length: 20 }, (_, index) => index + 1);

const t = useStrings();
const multiplier = ref<Multiplier>('single');
const multipliers = [
  { value: 'single' as const, label: t.game.single },
  { value: 'double' as const, label: t.game.double },
  { value: 'treble' as const, label: t.game.treble },
];
const prefix = computed(() => (multiplier.value === 'double' ? 'D' : multiplier.value === 'treble' ? 'T' : ''));
const isAim = (h: Hit) => props.aim !== null && props.aim.ring === h.ring && props.aim.value === h.value;

function send(h: Hit) {
  emit('hit', h);
  multiplier.value = 'single';
}
</script>

<template>
  <div :class="['keypad', `keypad-${multiplier}`]">
    <Segmented v-model="multiplier" class="keypad-multipliers" :options="multipliers" :label="t.game.multiplier" :disabled="disabled" />

    <div class="keypad-grid">
      <button
        v-for="sector in SECTORS"
        :key="sector"
        type="button"
        :class="['key', { 'key-aim': isAim(hit(sector, multiplier)) }]"
        :aria-label="String(sector)"
        :disabled="disabled"
        @click="send(hit(sector, multiplier))"
      >
        <span v-if="prefix" class="key-prefix" aria-hidden="true">{{ prefix }}</span>{{ sector }}
      </button>
    </div>

    <div class="keypad-specials">
      <button type="button" :class="['key', { 'key-aim': isAim(OUTER_BULL) }]" :disabled="disabled" @click="send(OUTER_BULL)">{{ t.game.outerBull }}</button>
      <button type="button" :class="['key', { 'key-aim': isAim(BULL) }]" :disabled="disabled" @click="send(BULL)">{{ t.game.bull }}</button>
      <button type="button" class="key key-miss" :disabled="disabled" @click="send(MISS)">{{ t.game.miss }}</button>
    </div>
  </div>
</template>
