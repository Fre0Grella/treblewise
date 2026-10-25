<!-- The front door: what treblewise is, before it drops anyone into a leg. -->
<script setup lang="ts">
import { useRouter } from 'vue-router';

import Dartboard from '../components/Dartboard.vue';
import InstallEntry from '../components/InstallEntry.vue';
import Wordmark from '../components/Wordmark.vue';
import { useStrings } from '../i18n/index.js';
import { PATHS } from '../router/paths.js';
import { useLobbyStore } from '../store/stores.js';

const t = useStrings();
const router = useRouter();
const lobby = useLobbyStore();
</script>

<template>
  <div class="landing-wrap">
    <!-- The board the app scores on, huge and faint behind the page, turning
         once every three minutes. Decoration only. -->
    <div class="landing-backdrop" aria-hidden="true">
      <div class="landing-backdrop-board">
        <Dartboard decorative />
      </div>
    </div>
    <div class="screen screen-landing">
      <header class="landing-hero">
        <h1 class="landing-mark"><Wordmark /></h1>
        <p class="landing-lede">{{ t.landing.lede }}</p>
        <!-- One primary: the way in. With a session open, the way back to it. -->
        <div class="landing-cta">
          <button v-if="lobby.session" type="button" class="btn-primary btn-lg" @click="router.push(PATHS.lobby)">
            {{ t.lobby.back }}
          </button>
          <!-- No "carry on with your match" here: a match is played on one device
               or two, and that is chosen first. The lobby offers to resume it. -->
          <button
            type="button"
            :class="lobby.session ? 'btn-lg' : 'btn-primary btn-lg'"
            @click="router.push(PATHS.start)"
          >
            {{ t.landing.cta }}
          </button>
          <button type="button" class="btn-quiet" @click="router.push(PATHS.stats)">{{ t.stats.title }}</button>
          <InstallEntry />
        </div>
      </header>

      <ul class="landing-points">
        <li v-for="point in t.landing.points" :key="point.title">
          <b>{{ point.title }}</b>
          <span>{{ point.body }}</span>
        </li>
      </ul>

      <section class="landing-roadmap">
        <h2>{{ t.landing.roadmapTitle }}</h2>
        <ol>
          <li
            v-for="(step, index) in t.landing.roadmap"
            :key="step.title"
            :class="{ 'is-now': index === 0, 'is-next': index === 1 }"
          >
            <span class="landing-step-when">{{ step.when }}</span>
            <b>{{ step.title }}</b>
            <span>{{ step.body }}</span>
          </li>
        </ol>
      </section>

      <p class="landing-credit">{{ t.landing.voiceCredit }}</p>
    </div>
  </div>
</template>
