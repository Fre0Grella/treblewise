<!--
  Explanatory text that can be folded away once it has been read. Open until
  someone closes it; this browser then remembers it closed, so a laptop that
  needs the room keeps it.
-->
<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ id: string; summary: string }>();

const KEY = 'treblewise.fold.';

function remembered(id: string): boolean {
  try {
    return localStorage.getItem(KEY + id) !== 'closed';
  } catch {
    return true;
  }
}

const open = ref(remembered(props.id));

function toggled(event: Event) {
  open.value = (event.currentTarget as HTMLDetailsElement).open;
  try {
    if (open.value) localStorage.removeItem(KEY + props.id);
    else localStorage.setItem(KEY + props.id, 'closed');
  } catch {
    // Private mode or storage switched off: it just opens again next time.
  }
}
</script>

<template>
  <details class="fold" :open="open" @toggle="toggled">
    <summary>{{ summary }}</summary>
    <slot />
  </details>
</template>
