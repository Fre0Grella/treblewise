<!--
  A single number, big, with what it is and how much it is worth trusting.

  Every statistic on the page carries its sample size, because "100%" from two
  darts and "38%" from four hundred are different kinds of fact and should not
  look the same.
-->
<script setup lang="ts">
defineProps<{
  label: string;
  value: string;
  /** Sample size, or whatever qualifies the number. */
  note?: string;
  /** Smaller tile, for the second rank of numbers. */
  small?: boolean;
  /** Explains a contested definition, shown on hover and long-press. */
  title?: string;
}>();
</script>

<template>
  <div :class="['tile', { 'tile-small': small }]" :title="title">
    <span class="tile-label">{{ label }}</span>
    <span class="tile-value">{{ value }}</span>
    <span v-if="note" class="tile-note">{{ note }}</span>
  </div>
</template>
