<!--
  The camera's brightness: a slider over what the camera allows
  (vision/exposure.ts). It moves freely under the finger and is set on the
  camera when let go, since every change costs the paired phone a message and
  its camera a moment to settle.

  The slider shows the setting; `range.value` is where the camera says it is.
  When the two disagree the camera has not taken it, and that is said, since
  nothing else would show it.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { fill, useStrings } from '../i18n/index.js';
import { clampExposure, type Exposure } from '../vision/exposure.js';

const props = defineProps<{ range: Exposure; value: number }>();
const emit = defineEmits<{ change: [value: number] }>();

const t = useStrings();
const shown = ref(props.value);
watch(
  () => props.value,
  (value) => (shown.value = value),
);

const ignored = computed(() => Math.abs(props.range.value - clampExposure(props.value, props.range)) > props.range.step / 2);

const signed = (value: number) => (value > 0 ? `+${value.toFixed(1)}` : value < 0 ? `−${Math.abs(value).toFixed(1)}` : '0');

function commit(value: number) {
  shown.value = value;
  if (value !== props.value) emit('change', value);
}
</script>

<template>
  <section class="panel exposure">
    <h2>{{ t.capture.exposureTitle }}</h2>
    <div class="exposure-row">
      <input
        v-model.number="shown"
        class="exposure-slider"
        type="range"
        :min="range.min"
        :max="range.max"
        :step="range.step"
        :aria-label="t.capture.exposureTitle"
        :aria-valuetext="fill(t.capture.exposureValue, { value: signed(shown) })"
        @change="commit(shown)"
      />
      <span class="exposure-value">{{ signed(shown) }}</span>
      <button type="button" class="btn-sm" :disabled="shown === 0" @click="commit(0)">{{ t.capture.exposureReset }}</button>
    </div>
    <p v-if="ignored" class="warning">{{ fill(t.capture.exposureIgnored, { value: signed(range.value) }) }}</p>
    <p class="hint">{{ t.capture.exposureHelp }}</p>
  </section>
</template>
