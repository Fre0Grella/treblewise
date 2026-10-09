<!--
  Keypad entry, for when tapping the board is not wanted: a dart recorded this
  way has a score but no position, and the statistics layer knows the
  difference.
-->
<script setup lang="ts">
import { BULL, MISS, OUTER_BULL, hit, type Hit } from '@treblewise/core';
import { ref } from 'vue';

import { useStrings } from '../i18n/index.js';
import Segmented from './ui/Segmented.vue';

type Multiplier = 'single' | 'double' | 'treble';

withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });
const emit = defineEmits<{ hit: [hit: Hit] }>();

const SECTOR_ORDER = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const t = useStrings();
const multiplier = ref<Multiplier>('single');
const multipliers = [
  { value: 'single' as const, label: t.game.single },
  { value: 'double' as const, label: t.game.double },
  { value: 'treble' as const, label: t.game.treble },
];

function send(h: Hit) {
  emit('hit', h);
  multiplier.value = 'single';
}
</script>

<template>
  <div class="keypad">
    <Segmented v-model="multiplier" class="keypad-multipliers" :options="multipliers" :label="t.game.multiplier" :disabled="disabled" />

    <div class="keypad-grid">
      <button
        v-for="sector in SECTOR_ORDER"
        :key="sector"
        type="button"
        :class="`key key-${multiplier}`"
        :disabled="disabled"
        @click="send(hit(sector, multiplier))"
      >
        {{ sector }}
      </button>
    </div>

    <div class="keypad-specials">
      <button type="button" class="key key-wide" :disabled="disabled" @click="send(OUTER_BULL)">{{ t.game.outerBull }}</button>
      <button type="button" class="key key-wide" :disabled="disabled" @click="send(BULL)">{{ t.game.bull }}</button>
      <button type="button" class="key key-wide key-miss" :disabled="disabled" @click="send(MISS)">{{ t.game.miss }}</button>
    </div>
  </div>
</template>
