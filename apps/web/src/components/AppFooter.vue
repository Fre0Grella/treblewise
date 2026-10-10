<!--
  The thin bar at the foot of every page (issue #25), as on BottleCount: the
  name, the source, privacy and terms on the left, who made it and a way to
  support it on the right. Its line runs the whole width of the window. The
  privacy page and the terms are linked from here only (issue #31).
-->
<script setup lang="ts">
import { useStrings } from '../i18n/index.js';
import { PATHS } from '../router/paths.js';

const t = useStrings();
const year = new Date().getFullYear();
</script>

<template>
  <footer class="app-footer">
    <div class="app-footer-group">
      <span>© {{ year }} {{ t.app.name }}</span>
      <span class="app-footer-sep" aria-hidden="true">·</span>
      <a href="https://github.com/Fre0Grella/treblewise" target="_blank" rel="noreferrer">{{ t.footer.source }}</a>
      <span class="app-footer-sep" aria-hidden="true">·</span>
      <RouterLink :to="PATHS.privacy">{{ t.footer.privacy }}</RouterLink>
      <span class="app-footer-sep" aria-hidden="true">·</span>
      <RouterLink :to="PATHS.terms">{{ t.footer.terms }}</RouterLink>
    </div>
    <div class="app-footer-group">
      <span>{{ t.footer.madeBy }}</span>
      <span class="app-footer-sep" aria-hidden="true">·</span>
      <a href="https://github.com/Fre0Grella" target="_blank" rel="noreferrer">{{ t.footer.github }}</a>
      <span class="app-footer-sep" aria-hidden="true">·</span>
      <a href="https://www.linkedin.com/in/marco-galeri-2b6500384/" target="_blank" rel="noreferrer">{{ t.footer.linkedin }}</a>
      <span class="app-footer-sep" aria-hidden="true">·</span>
      <a class="app-footer-donate" href="https://ko-fi.com/freogrella" target="_blank" rel="noreferrer">{{ t.footer.donate }}</a>
    </div>
  </footer>
</template>
