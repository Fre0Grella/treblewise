<!--
  A big card that is one choice: a picture, what it is, what it gives you, and
  what pressing it does. The mode chooser and "which device is this?" use it.
  The whole card is the button; its foot lights up beige when it is pointed at.
-->
<script setup lang="ts">
import Icon, { type IconName } from './Icon.vue';

defineProps<{
  /** Drawn above the title, where a card has no picture. */
  icon?: IconName;
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
    <span v-if="icon" class="mode-icon" aria-hidden="true"><Icon :name="icon" :size="30" /></span>
    <h2>{{ title }}</h2>
    <p>{{ body }}</p>
    <ul v-if="points?.length">
      <li v-for="point in points" :key="point"><Icon name="check" :size="14" />{{ point }}</li>
    </ul>
    <span class="mode-go">{{ action }} <Icon name="forward" /></span>
  </button>
</template>
