<!--
  "Install app", where the browser offers it; on an iPhone, where it never
  does, how to do it by hand. Nothing at all inside the installed app
  (src/pwa/install.ts).
-->
<script setup lang="ts">
import { computed } from 'vue';

import { useStrings } from '../i18n/index.js';
import { canInstall, install, installed, onIos } from '../pwa/install.js';

const t = useStrings();
const ios = onIos();
const shown = computed(() => (installed.value ? null : canInstall.value ? 'button' : ios ? 'ios' : null));
</script>

<template>
  <button v-if="shown === 'button'" type="button" class="btn-quiet" @click="install">{{ t.pwa.install }}</button>
  <p v-else-if="shown === 'ios'" class="hint install-ios">{{ t.pwa.iosHint }}</p>
</template>
