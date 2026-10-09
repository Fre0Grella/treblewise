<!--
  A big card that is one choice: a picture, what it is, what it gives you, and
  what pressing it does. The mode chooser and "which device is this?" use it.
-->
<script setup lang="ts">
defineProps<{
  title: string;
  body: string;
  points?: readonly string[];
  action: string;
}>();
defineEmits<{ choose: [] }>();
</script>

<template>
  <button type="button" class="mode-card" @click="$emit('choose')">
    <slot name="art" />
    <h2>{{ title }}</h2>
    <p>{{ body }}</p>
    <ul v-if="points?.length">
      <li v-for="point in points" :key="point">{{ point }}</li>
    </ul>
    <span class="mode-go">{{ action }}</span>
  </button>
</template>
