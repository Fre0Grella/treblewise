<!--
  Spinning the wheel: a segment per player, in the board's colours, and a
  pointer at the top. The pick is made when Spin is pressed (game/throwOrder.ts
  `pickOne`); the spin is the show, turning the wheel to stop on it. Whoever it
  stops on throws first, the rest following in turn as they were.
-->
<script setup lang="ts">
import type { PlayerConfig } from '@treblewise/core';
import { computed, onBeforeUnmount, ref } from 'vue';

import { pickOne, startingWith, wheelTurn } from '../../game/throwOrder.js';
import { fill, useStrings } from '../../i18n/index.js';
import Icon from '../ui/Icon.vue';

const props = defineProps<{ players: PlayerConfig[] }>();
/** Everyone in order once the wheel has stopped; null until then. */
const order = defineModel<PlayerConfig[] | null>('order', { required: true });

const t = useStrings();

const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPIN_MS = reduced ? 300 : 4200;

const rotation = ref(0);
const spinning = ref(false);
const picked = ref<PlayerConfig | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));

/** The board's colours, round the wheel; never the same colour side by side. */
const COLOURS = [
  { fill: 'var(--beige-300)', ink: 'var(--black-900)' },
  { fill: 'var(--board-green)', ink: 'var(--beige-100)' },
  { fill: 'var(--board-red)', ink: 'var(--beige-100)' },
  { fill: 'var(--black-700)', ink: 'var(--beige-100)' },
];

const R = 96;
const segments = computed(() => {
  const n = props.players.length;
  const angle = 360 / n;
  const point = (degrees: number) => {
    const radians = ((degrees - 90) * Math.PI) / 180;
    return `${(R * Math.cos(radians)).toFixed(3)} ${(R * Math.sin(radians)).toFixed(3)}`;
  };
  return props.players.map((player, index) => {
    const start = index * angle;
    const end = start + angle;
    // The last segment meets the first: it skips the first's colour.
    const colour = COLOURS[index === n - 1 && index % COLOURS.length === 0 && n > 1 ? 1 : index % COLOURS.length]!;
    const name = player.name.length > 11 ? `${player.name.slice(0, 10)}…` : player.name;
    return {
      id: player.id,
      path: `M0 0 L${point(start)} A${R} ${R} 0 ${angle > 180 ? 1 : 0} 1 ${point(end)} Z`,
      colour,
      name,
      // The name along the middle of its segment, reading outwards.
      label: `rotate(${start + angle / 2 - 90}) translate(${R * 0.58} 0)`,
    };
  });
});

function spin() {
  if (spinning.value || props.players.length === 0) return;
  const index = pickOne(props.players.length);
  const chosen = props.players[index]!;
  order.value = null;
  picked.value = null;
  spinning.value = true;
  const jitter = Math.random() * 2 - 1;
  // Always forwards, from wherever the last spin stopped.
  rotation.value = rotation.value - (rotation.value % 360) + wheelTurn(index, props.players.length, 5, jitter);
  timer = setTimeout(() => {
    spinning.value = false;
    picked.value = chosen;
    order.value = startingWith(props.players, chosen.id);
  }, SPIN_MS);
}
</script>

<template>
  <div class="spin-wheel">
    <svg class="spin-wheel-svg" viewBox="-100 -108 200 208" role="img" :aria-label="t.setup.order.wheel.title">
      <g :style="{ transform: `rotate(${rotation}deg)`, transitionDuration: `${SPIN_MS}ms` }" class="spin-wheel-face">
        <g v-for="segment in segments" :key="segment.id">
          <path :d="segment.path" :fill="segment.colour.fill" stroke="var(--bg)" stroke-width="1" />
          <text :transform="segment.label" :fill="segment.colour.ink" class="spin-wheel-name" dominant-baseline="middle" text-anchor="middle">
            {{ segment.name }}
          </text>
        </g>
        <circle r="9" fill="var(--bg)" stroke="var(--beige-300)" stroke-width="2" />
      </g>
      <!-- The pointer: what is under it at the top is picked. -->
      <path d="M-8 -106 L8 -106 L0 -90 Z" fill="var(--text)" />
    </svg>

    <p class="bull-off-say" role="status">
      {{ spinning ? t.setup.order.spinning : picked ? fill(t.setup.order.wheelPicked, { name: picked.name }) : '' }}
    </p>
    <div class="controls">
      <button type="button" :class="picked ? 'btn-sm' : 'btn-primary'" :disabled="spinning" @click="spin">
        <Icon name="wheel" :size="18" />{{ picked ? t.setup.order.spinAgain : t.setup.order.spin }}
      </button>
    </div>
  </div>
</template>
