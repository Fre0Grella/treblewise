<!--
  The short terms (issue #31), linked from the footer only. The model's
  datasets come from the manifest of the model the site ships, so they name
  whatever is actually served.
-->
<script setup lang="ts">
import { onMounted, shallowRef } from 'vue';

import ScreenShell from '../components/ui/ScreenShell.vue';
import { fill, useStrings } from '../i18n/index.js';
import { useReturn } from '../router/back.js';
import { loadManifest, type ModelManifest } from '../vision/detector.js';

const t = useStrings();
const back = useReturn();
const model = shallowRef<ModelManifest | null>(null);
onMounted(async () => (model.value = await loadManifest()));
</script>

<template>
  <ScreenShell name="legal" :title="t.terms.title" :lead="t.terms.lead" :on-back="back">
    <p class="legal-updated">{{ t.terms.updated }}</p>
    <section v-for="section in t.terms.sections" :key="section.title" class="legal-section">
      <h2>{{ section.title }}</h2>
      <p v-for="line in section.body" :key="line">{{ line }}</p>
      <p v-if="'links' in section">
        <a href="https://github.com/Fre0Grella/treblewise" target="_blank" rel="noreferrer">{{ t.terms.source }}</a>
        ·
        <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer">{{ t.terms.licence }}</a>
      </p>
    </section>
    <section class="legal-section">
      <h2>{{ t.terms.modelTitle }}</h2>
      <template v-if="model && (model.deepdarts || model.dartscribe)">
        <p>{{ fill(t.terms.modelTrained, { name: model.name }) }}</p>
        <ul>
          <li v-if="model.deepdarts">{{ t.capture.deepdartsCredit }}</li>
          <li v-if="model.dartscribe">{{ t.capture.dartscribeCredit }}</li>
        </ul>
        <p v-if="model.dartscribe">{{ t.terms.modelShareAlike }}</p>
      </template>
      <p v-else>{{ t.terms.modelNone }}</p>
    </section>
    <section class="legal-section">
      <h2>{{ t.terms.changesTitle }}</h2>
      <p>{{ t.terms.changes }}</p>
    </section>
  </ScreenShell>
</template>
