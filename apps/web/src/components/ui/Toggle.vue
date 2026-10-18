<!-- A small button that is on or off, announced as pressed or not. Settings rows use Switch instead. -->
<script setup lang="ts">
defineProps<{ label: string }>();
const on = defineModel<boolean>({ required: true });
</script>

<template>
  <button type="button" :class="['btn-sm', { 'toggle-on': on }]" :aria-pressed="on" @click="on = !on">
    {{ label }}
  </button>
</template>
