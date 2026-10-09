<!--
  One choice out of a few, as a row of chips: a start score, a rule, a period.

  A radio group, so a keyboard and a screen reader get what it is: one tab stop
  for the row, the arrow keys move the choice (wrapping), and the chosen chip
  is announced as checked. It looks like the chip rows it replaces.
-->
<script setup lang="ts" generic="T extends string | number">
import { ref } from 'vue';

const props = defineProps<{
  options: readonly { value: T; label: string }[];
  /** What the row chooses, for a screen reader. */
  label: string;
  disabled?: boolean;
}>();

const model = defineModel<T>({ required: true });
const chips = ref<HTMLButtonElement[]>([]);

function move(event: KeyboardEvent, index: number) {
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
  if (step === 0) return;
  event.preventDefault();
  const to = (index + step + props.options.length) % props.options.length;
  model.value = props.options[to]!.value;
  chips.value[to]?.focus();
}
</script>

<template>
  <div class="chip-row" role="radiogroup" :aria-label="label" :aria-disabled="disabled || undefined">
    <button
      v-for="(option, index) in options"
      :key="String(option.value)"
      ref="chips"
      type="button"
      role="radio"
      :class="['chip', { 'chip-on': option.value === model }]"
      :aria-checked="option.value === model"
      :tabindex="option.value === model ? 0 : -1"
      :disabled="disabled"
      @click="model = option.value"
      @keydown="move($event, index)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
