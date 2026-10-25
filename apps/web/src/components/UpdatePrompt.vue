<!--
  "A new version is ready": shown on every page once one has downloaded, and
  never acted on alone. Reload goes to it, and a match in progress resumes
  there (src/pwa/update.ts); Later leaves it waiting until the next visit.
-->
<script setup lang="ts">
import { ref } from 'vue';

import { useStrings } from '../i18n/index.js';
import { applyUpdate, updateReady } from '../pwa/update.js';

const t = useStrings();
const later = ref(false);
</script>

<template>
  <div v-if="updateReady && !later" class="toast update-prompt" role="status">
    <span>{{ t.pwa.updateReady }}</span>
    <button type="button" class="btn-primary btn-sm" @click="applyUpdate">{{ t.pwa.reload }}</button>
    <button type="button" class="btn-quiet btn-sm" @click="later = true">{{ t.pwa.later }}</button>
  </div>
</template>
