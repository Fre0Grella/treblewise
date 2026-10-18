<!--
  Something that is on or off (the caller, the sounds, the camera): a row with
  its name on the left and a real switch on the right, announced as a switch.
  It replaces the chip that said "Caller on" (issue #20).
-->
<script setup lang="ts">
defineProps<{ label: string; note?: string; disabled?: boolean }>();
const on = defineModel<boolean>({ required: true });
</script>

<template>
  <button type="button" class="switch" role="switch" :aria-checked="on" :disabled="disabled" @click="on = !on">
    <span class="switch-text">
      <span>{{ label }}</span>
      <span v-if="note" class="switch-note">{{ note }}</span>
    </span>
    <span class="switch-track" aria-hidden="true" />
  </button>
</template>
