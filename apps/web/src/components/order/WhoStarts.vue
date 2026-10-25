<!--
  Who throws first (issue #41), after "Start match" with two or more players:
  set by hand, thrown for at the bull, or a spin of the wheel. Each way ends
  as the players in throwing order, which is what the match starts with.
-->
<script setup lang="ts">
import type { PlayerConfig } from '@treblewise/core';
import { ref, shallowRef, watch } from 'vue';

import { useStrings } from '../../i18n/index.js';
import ChoiceCard from '../ui/ChoiceCard.vue';
import Icon, { type IconName } from '../ui/Icon.vue';
import BullOff from './BullOff.vue';
import OrderList from './OrderList.vue';
import SpinWheel from './SpinWheel.vue';

type Way = 'choose' | 'bull' | 'wheel';

const props = defineProps<{ players: PlayerConfig[] }>();
/** The players in throwing order once decided; null until then. */
const order = defineModel<PlayerConfig[] | null>('order', { required: true });

const t = useStrings();
const way = ref<Way | null>(null);
/**
 * Set by hand, the order is decided from the start: the lineup as it is.
 * Shallow, as the lineup is: the players go into the stored match as they
 * are, and IndexedDB refuses a Vue proxy.
 */
const chosen = shallowRef<PlayerConfig[]>([...props.players]);

watch(way, (now) => {
  order.value = now === 'choose' ? chosen.value : null;
});
watch(chosen, (now) => {
  if (way.value === 'choose') order.value = now;
});

const WAYS: Way[] = ['choose', 'bull', 'wheel'];
const ICONS: Record<Way, IconName> = { choose: 'order', bull: 'bull', wheel: 'wheel' };
</script>

<template>
  <div class="who-starts">
    <p class="hint">{{ t.setup.order.lead }}</p>

    <div v-if="way === null" class="mode-cards">
      <ChoiceCard
        v-for="option in WAYS"
        :key="option"
        :icon="ICONS[option]"
        :title="t.setup.order[option].title"
        :body="t.setup.order[option].body"
        :action="t.setup.order[option].action"
        @choose="way = option"
      />
    </div>

    <template v-else>
      <div class="who-starts-head">
        <h2><Icon :name="ICONS[way]" :size="28" />{{ t.setup.order[way].title }}</h2>
        <button type="button" class="btn-quiet btn-sm" @click="way = null">
          <Icon name="back" :size="18" />{{ t.setup.order.another }}
        </button>
      </div>
      <OrderList v-if="way === 'choose'" v-model="chosen" />
      <BullOff v-else-if="way === 'bull'" v-model:order="order" :players="players" />
      <SpinWheel v-else v-model:order="order" :players="players" />
    </template>
  </div>
</template>
