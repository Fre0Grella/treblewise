<!-- The front door: what treblewise is, before it drops anyone into a leg. -->
<script setup lang="ts">
import { useRouter } from 'vue-router';

import AppFooter from '../components/AppFooter.vue';
import Dartboard from '../components/Dartboard.vue';
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
        <h1 class="landing-mark">{{ t.app.name }}</h1>
        <p class="landing-lede">{{ t.landing.lede }}</p>
      </header>

      <div class="landing-cta">
        <button v-if="lobby.session" type="button" class="primary board-btn" @click="router.push(PATHS.lobby)">
          {{ t.lobby.back }}
        </button>
        <!-- No "carry on with your match" here: a match is played on one device
             or two, and that is chosen first. The lobby offers to resume it. -->
        <button type="button" :class="lobby.session ? 'chip' : 'primary board-btn'" @click="router.push(PATHS.start)">
          {{ t.landing.cta }}
        </button>
        <button type="button" class="chip" @click="router.push(PATHS.stats)">{{ t.stats.title }}</button>
      </div>

      <ul class="landing-points">
        <li v-for="point in t.landing.points" :key="point.title">
          <b>{{ point.title }}</b>
          <span>{{ point.body }}</span>
        </li>
      </ul>

      <section class="panel landing-honest">
        <h2>{{ t.landing.statusTitle }}</h2>
        <p>{{ t.landing.status }}</p>
      </section>

      <p class="landing-credit">{{ t.landing.voiceCredit }}</p>
      <AppFooter />
    </div>
  </div>
</template>
