<!--
  What the app keeps, where, and how to delete it (issue #31), linked from the
  footer only. Every line is true of the app as built: when what it stores or
  sends changes, this page changes with it.
-->
<script setup lang="ts">
import ScreenShell from '../components/ui/ScreenShell.vue';
import { useStrings } from '../i18n/index.js';
import { useReturn } from '../router/back.js';

const t = useStrings();
const back = useReturn();
</script>

<template>
  <ScreenShell name="legal" :title="t.privacy.title" :lead="t.privacy.lead" :on-back="back">
    <p class="legal-updated">{{ t.privacy.updated }}</p>
    <section v-for="section in t.privacy.sections" :key="section.title" class="legal-section">
      <h2>{{ section.title }}</h2>
      <ul v-if="'list' in section">
        <li v-for="line in section.body" :key="line">{{ line }}</li>
      </ul>
      <template v-else>
        <p v-for="line in section.body" :key="line">{{ line }}</p>
      </template>
    </section>
    <section class="legal-section">
      <h2>{{ t.privacy.contactTitle }}</h2>
      <p>
        {{ t.privacy.contact }}
        <a href="https://github.com/Fre0Grella" target="_blank" rel="noreferrer">{{ t.privacy.contactLink }}</a>
      </p>
    </section>
  </ScreenShell>
</template>
