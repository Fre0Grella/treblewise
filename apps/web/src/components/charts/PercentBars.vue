<!--
  Hit rates as bars, one row each: the label, the bar, the percentage with
  its hits out of darts. The X01 doubles and every game's targets use it.
  Selectable, a row is a button that picks its item (the board of targets
  shows the one picked).
-->
<script setup lang="ts">
export interface PercentBar {
  key: string;
  label: string;
  percent: number | null;
  hits: number;
  darts: number;
}

withDefaults(defineProps<{ bars: readonly PercentBar[]; selectable?: boolean; picked?: string | null }>(), {
  selectable: false,
  picked: null,
});
defineEmits<{ pick: [key: string] }>();
</script>

<template>
  <ul class="bars">
    <li v-for="bar in bars" :key="bar.key" :class="{ 'bars-picked': picked === bar.key }">
      <component
        :is="selectable ? 'button' : 'span'"
        :type="selectable ? 'button' : undefined"
        :class="['bars-label', { 'bars-pick': selectable }]"
        :aria-pressed="selectable ? picked === bar.key : undefined"
        @click="selectable && $emit('pick', bar.key)"
      >
        {{ bar.label }}
      </component>
      <span class="bars-track">
        <span class="bars-fill" :style="{ width: `${bar.percent ?? 0}%` }" />
      </span>
      <span class="bars-value">
        {{ bar.percent === null ? '—' : `${Math.round(bar.percent)}%` }}
        <small>{{ bar.hits }}/{{ bar.darts }}</small>
      </span>
    </li>
  </ul>
</template>
