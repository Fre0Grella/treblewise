<!-- A chip that is on or off (the caller, the sounds), announced as pressed or not. -->
<script setup lang="ts">
defineProps<{ label: string }>();
const on = defineModel<boolean>({ required: true });
</script>

<template>
  <button type="button" :class="['chip', { 'chip-on': on }]" :aria-pressed="on" @click="on = !on">
    {{ label }}
  </button>
</template>
