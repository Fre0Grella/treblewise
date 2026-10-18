<!--
  A small whole number, one step at a time: legs, sets. Minus, the number,
  plus (issue #20), instead of a number box nobody types into.
-->
<script setup lang="ts">
import { useStrings } from '../../i18n/index.js';
import Icon from './Icon.vue';

const props = defineProps<{ label: string; min: number; max: number }>();
const value = defineModel<number>({ required: true });
const t = useStrings();

const step = (by: number) => {
  value.value = Math.min(props.max, Math.max(props.min, value.value + by));
};
</script>

<template>
  <span class="stepper" role="group" :aria-label="label">
    <button type="button" class="btn-sm btn-icon" :aria-label="`${t.setup.fewer}: ${label}`" :disabled="value <= min" @click="step(-1)">
      <Icon name="minus" :size="16" />
    </button>
    <output class="num stepper-value" aria-live="polite">{{ value }}</output>
    <button type="button" class="btn-sm btn-icon" :aria-label="`${t.setup.more}: ${label}`" :disabled="value >= max" @click="step(1)">
      <Icon name="plus" :size="16" />
    </button>
  </span>
</template>
