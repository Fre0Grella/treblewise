<!--
  Two devices, two jobs: which one is this?

  Pairing used to hide this behind a small link under the mode chooser, which
  put the phone's half of the feature somewhere nobody looks. It is a choice of
  the same size as "one device or two", so it gets the same illustrated cards:
  the same drawing as the step before, with the end you are holding lit up.
-->
<script setup lang="ts">
import { useRouter } from 'vue-router';

import PairedModeArt from '../../components/art/PairedModeArt.vue';
import ChoiceCard from '../../components/ui/ChoiceCard.vue';
import ScreenShell from '../../components/ui/ScreenShell.vue';
import { useStrings } from '../../i18n/index.js';
import { PATHS } from '../../router/paths.js';
import { useLobbyStore } from '../../store/stores.js';

const t = useStrings();
const router = useRouter();
const lobby = useLobbyStore();

function computer() {
  lobby.setMode('paired');
  void router.push(PATHS.pairLaptop);
}

// The phone never becomes the scoreboard: it is a camera with a dimmed
// screen, so it does not take the match's mode with it.
const phone = () => void router.push(PATHS.pairPhone);

// One step back is the choice of one device or two, not the front door.
const back = () => void router.push(PATHS.start);
</script>

<template>
  <ScreenShell name="mode" :title="t.role.title" :lead="t.role.subtitle" :back-label="t.role.back" :on-back="back">
    <div class="mode-cards">
      <ChoiceCard
        :title="t.role.computer.title"
        :body="t.role.computer.body"
        :points="t.role.computer.points"
        :action="t.role.computer.action"
        @choose="computer"
      >
        <template #art><PairedModeArt focus="computer" /></template>
      </ChoiceCard>
      <ChoiceCard
        :title="t.role.phone.title"
        :body="t.role.phone.body"
        :points="t.role.phone.points"
        :action="t.role.phone.action"
        @choose="phone"
      >
        <template #art><PairedModeArt focus="phone" /></template>
      </ChoiceCard>
    </div>
  </ScreenShell>
</template>
