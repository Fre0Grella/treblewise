<!--
  One device or two. Solo needs nothing more: straight into the lobby. Two
  devices means one more question (which one is this?), asked on its own
  screen, with pictures; the lobby opens once the phone is connected.
-->
<script setup lang="ts">
import { useRouter } from 'vue-router';

import PairedModeArt from '../components/art/PairedModeArt.vue';
import SoloModeArt from '../components/art/SoloModeArt.vue';
import ChoiceCard from '../components/ui/ChoiceCard.vue';
import ScreenShell from '../components/ui/ScreenShell.vue';
import { useStrings } from '../i18n/index.js';
import { PATHS } from '../router/paths.js';
import { useLobbyStore, type PlayMode } from '../store/stores.js';

const t = useStrings();
const router = useRouter();
const lobby = useLobbyStore();

function choose(mode: PlayMode) {
  if (mode === 'solo') {
    lobby.enter('solo');
    void router.push(PATHS.lobby);
    return;
  }
  lobby.setMode(mode);
  void router.push(PATHS.pair);
}
</script>

<template>
  <ScreenShell name="mode" :title="t.mode.title" :lead="t.mode.subtitle" :back-label="t.mode.back">
    <div class="mode-cards">
      <ChoiceCard
        :title="t.mode.solo.title"
        :body="t.mode.solo.body"
        :points="t.mode.solo.points"
        :action="t.mode.solo.action"
        @choose="choose('solo')"
      >
        <template #art><SoloModeArt /></template>
      </ChoiceCard>
      <ChoiceCard
        :title="t.mode.paired.title"
        :body="t.mode.paired.body"
        :points="t.mode.paired.points"
        :action="t.mode.paired.action"
        @choose="choose('paired')"
      >
        <template #art><PairedModeArt /></template>
      </ChoiceCard>
    </div>
  </ScreenShell>
</template>
