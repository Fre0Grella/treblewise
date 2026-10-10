<!--
  Fullscreen on and off, from any screen (issue #35): the address bar and the
  tabs take room on a laptop or tablet read from across the room.

  The browser owns the state, not the button: Esc, or the browser itself, can
  leave fullscreen at any time, so the button follows `fullscreenchange`.
  Fullscreen stays on across screens and after a match, until the player turns
  it off. Where a page cannot go fullscreen (iPhone Safari) the button is not
  there at all; the installed app (#13) is the way to fill the screen there.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { useStrings } from '../../i18n/index.js';

const t = useStrings();
const supported = document.fullscreenEnabled === true;
const on = ref(document.fullscreenElement != null);

const follow = () => (on.value = document.fullscreenElement != null);
onMounted(() => document.addEventListener('fullscreenchange', follow));
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', follow));

function toggle() {
  // Refused outside a tap or click, and in some embeds: then nothing changes.
  const done = on.value ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  done.catch(() => undefined);
}
</script>

<template>
  <button
    v-if="supported"
    type="button"
    class="icon-btn fullscreen-btn"
    :aria-label="on ? t.app.fullscreenOff : t.app.fullscreenOn"
    :title="on ? t.app.fullscreenOff : t.app.fullscreenOn"
    :aria-pressed="on"
    @click="toggle"
  >
    <!-- Four corners: pointing out to fill the screen, pointing in to leave. -->
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path v-if="on" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      <path v-else d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  </button>
</template>
