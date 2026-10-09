<!--
  Who is at the oche and the darts of their visit, as a row of chips. The game
  shows three of them (the visit being thrown, the one just thrown, the one
  held until its darts come out) and the capture lab one (the darts marked so
  far). Picking a chip is how a dart is corrected.
-->
<script setup lang="ts">
import { formatHit, type Hit } from '@treblewise/core';

withDefaults(
  defineProps<{
    who: string;
    darts: readonly { id: string; hit: Hit; source?: string }[];
    /** Empty places still to throw, drawn as dots. */
    empty?: number;
    /** The dart being corrected, if any. */
    correcting?: string | null;
    /** Chips can be picked, to correct their dart. */
    pickable?: boolean;
    variant?: 'held' | 'last';
    /** Shown on a pickable chip. */
    hint?: string;
  }>(),
  { empty: 0, correcting: null, pickable: false, variant: undefined, hint: undefined },
);

defineEmits<{ pick: [id: string] }>();
</script>

<template>
  <div :class="['throw-strip', variant ? `throw-strip-${variant}` : undefined]">
    <span class="throw-who">{{ who }}</span>
    <span class="throw-darts">
      <template v-for="dart in darts" :key="dart.id">
        <button
          v-if="pickable"
          type="button"
          :class="['dart-chip', { 'dart-chip-correcting': correcting === dart.id, 'dart-chip-auto': dart.source === 'auto' }]"
          :title="hint"
          @click="$emit('pick', dart.id)"
        >
          {{ formatHit(dart.hit) }}
        </button>
        <span v-else class="dart-chip">{{ formatHit(dart.hit) }}</span>
      </template>
      <span v-for="index in empty" :key="`empty-${index}`" class="dart-chip dart-chip-empty">·</span>
    </span>
    <slot name="actions" />
  </div>
</template>
