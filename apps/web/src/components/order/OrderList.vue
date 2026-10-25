<!--
  The players in throwing order, put in order by hand: drag one by its handle,
  or move it with the arrows (a keyboard, and anyone who would rather not drag).

  Dragging works with pointer events rather than the browser's drag and drop,
  which phones do not do: the handle keeps the pointer, and the player moves
  to whichever row's middle the pointer is nearest.
-->
<script setup lang="ts">
import type { PlayerConfig } from '@treblewise/core';
import { ref } from 'vue';

import { moveTo } from '../../game/throwOrder.js';
import { fill, useStrings } from '../../i18n/index.js';
import Icon from '../ui/Icon.vue';

const order = defineModel<PlayerConfig[]>({ required: true });

const t = useStrings();
const rows = ref<HTMLElement[]>([]);
const dragging = ref<string | null>(null);

function move(from: number, to: number) {
  if (to < 0 || to >= order.value.length || to === from) return;
  order.value = moveTo(order.value, from, to);
}

function grab(event: PointerEvent, id: string) {
  dragging.value = id;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function drag(event: PointerEvent) {
  const id = dragging.value;
  if (id === null) return;
  const from = order.value.findIndex((player) => player.id === id);
  let nearest = from;
  let best = Infinity;
  rows.value.forEach((row, index) => {
    const box = row.getBoundingClientRect();
    const away = Math.abs(event.clientY - (box.top + box.height / 2));
    if (away < best) {
      best = away;
      nearest = index;
    }
  });
  move(from, nearest);
}

function drop() {
  dragging.value = null;
}
</script>

<template>
  <div class="order-list">
    <p class="hint">{{ t.setup.order.dragHint }}</p>
    <ol class="lineup">
      <li
        v-for="(player, index) in order"
        :key="player.id"
        :ref="(row) => row && (rows[index] = row as HTMLElement)"
        :class="['row', 'order-row', { 'order-row-dragging': dragging === player.id }]"
      >
        <button
          type="button"
          class="btn-quiet btn-icon order-handle"
          :aria-label="fill(t.setup.order.drag, { name: player.name })"
          @pointerdown="grab($event, player.id)"
          @pointermove="drag"
          @pointerup="drop"
          @pointercancel="drop"
        >
          <Icon name="drag" :size="18" />
        </button>
        <span class="lineup-name">{{ player.name }}</span>
        <span v-if="index === 0" class="tag tag-on">{{ t.setup.order.throwsFirst }}</span>
        <button
          type="button"
          class="btn-quiet btn-icon"
          :aria-label="fill(t.setup.order.moveUp, { name: player.name })"
          :disabled="index === 0"
          @click="move(index, index - 1)"
        >
          <Icon name="chevron-up" :size="18" />
        </button>
        <button
          type="button"
          class="btn-quiet btn-icon"
          :aria-label="fill(t.setup.order.moveDown, { name: player.name })"
          :disabled="index === order.length - 1"
          @click="move(index, index + 1)"
        >
          <Icon name="chevron-down" :size="18" />
        </button>
      </li>
    </ol>
  </div>
</template>
