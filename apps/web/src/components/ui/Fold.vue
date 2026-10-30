<!--
  Explanatory text that can be folded away once it has been read. Open until
  someone closes it, or closed until someone opens it (`closed`), and this
  browser then remembers which, so a laptop that needs the room keeps it.
-->
<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(defineProps<{ id: string; summary: string; closed?: boolean }>(), { closed: false });

const KEY = 'treblewise.fold.';

function remembered(id: string, open: boolean): boolean {
  try {
    const kept = localStorage.getItem(KEY + id);
    return kept === null ? open : kept !== 'closed';
  } catch {
    return open;
  }
}

const open = ref(remembered(props.id, !props.closed));

function toggled(event: Event) {
  open.value = (event.currentTarget as HTMLDetailsElement).open;
  try {
    localStorage.setItem(KEY + props.id, open.value ? 'open' : 'closed');
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
