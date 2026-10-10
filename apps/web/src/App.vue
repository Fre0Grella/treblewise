<!--
  The app is its router: the stores are filled before it mounts (main.ts).
  Around every page, the same two things: fullscreen in the top right corner
  (issue #35) and the footer under it all (issue #25).
-->
<script setup lang="ts">
import AppFooter from './components/AppFooter.vue';
import FullscreenButton from './components/ui/FullscreenButton.vue';
</script>

<template>
  <div class="app">
    <main class="app-page">
      <RouterView />
    </main>
    <FullscreenButton class="app-fullscreen" />
    <AppFooter />
  </div>
</template>
