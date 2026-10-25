<!--
  The app is its router: the stores are filled before it mounts (main.ts).
  Around every page, the same three things: fullscreen in the top right corner
  (issue #35), the footer under it all (issue #25), and word of a new version
  (issue #13).
-->
<script setup lang="ts">
import AppFooter from './components/AppFooter.vue';
import UpdatePrompt from './components/UpdatePrompt.vue';
import FullscreenButton from './components/ui/FullscreenButton.vue';
</script>

<template>
  <div class="app">
    <main class="app-page">
      <RouterView />
    </main>
    <FullscreenButton class="app-fullscreen" />
    <AppFooter />
    <UpdatePrompt />
  </div>
</template>
