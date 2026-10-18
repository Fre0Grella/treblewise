<!--
  The leg visit by visit, newest first, dart by dart (issue #15): the place
  to check what was entered and to put a wrong dart right. The visit being
  thrown sits on top; the last one thrown is bigger, with the way to mark it
  on its photograph. With the autoscorer on, a dart entered by hand is the
  exception, so only that one is marked; a corrected dart shows what it was.

  It can be hidden, for a two-column match screen.
-->
<script setup lang="ts">
import { useStrings } from '../i18n/index.js';
import Icon from './ui/Icon.vue';

export interface SheetDart {
  id: string;
  label: string;
  /** Entered by hand while the autoscorer scores. */
  hand: boolean;
  /** What a corrected dart was read as. */
  was: string | null;
}

export interface SheetVisit {
  key: string;
  /** 0 for the first player, 1 for the second, and so on: their colour. */
  player: number;
  name: string;
  total: string;
  left: string;
  darts: readonly SheetDart[];
  /** The visit being thrown. */
  live: boolean;
  /** The last visit thrown. */
  last: boolean;
  bust: boolean;
  /** Its photograph is the one a report opens on. */
  markable: boolean;
}

defineProps<{
  title: string;
  visits: readonly SheetVisit[];
  /** The dart being corrected. */
  picked: string | null;
  /** "Mark on the photo" can be offered on the last visit. */
  canMark: boolean;
}>();
defineEmits<{ pick: [id: string]; mark: []; hide: [] }>();

const t = useStrings();
</script>

<template>
  <section class="sheet" :aria-label="title">
    <div class="sheet-head">
      <h2>{{ title }}</h2>
      <button type="button" class="btn-quiet btn-icon" :aria-label="t.game.hideVisits" @click="$emit('hide')">
        <Icon name="close" :size="18" />
      </button>
    </div>
    <ol class="sheet-list">
      <li
        v-for="visit in visits"
        :key="visit.key"
        :class="['sheet-visit', { 'sheet-visit-live': visit.live, 'sheet-visit-last': visit.last }]"
      >
        <div class="sheet-visit-head">
          <span :class="['sheet-visit-name', `player-${visit.player % 2 === 0 ? 'a' : 'b'}`]">{{ visit.name }}</span>
          <span :class="['num', 'sheet-visit-total', { 'sheet-visit-bust': visit.bust }]">{{ visit.total }}</span>
          <span class="sheet-visit-left">{{ visit.left }}</span>
        </div>
        <div class="sheet-darts">
          <button
            v-for="dart in visit.darts"
            :key="dart.id"
            type="button"
            :class="['sheet-dart', { 'sheet-dart-picked': picked === dart.id }]"
            :aria-pressed="picked === dart.id"
            :aria-label="`${dart.label}${dart.hand ? `, ${t.game.byHand}` : ''}. ${t.game.correctHint}`"
            @click="$emit('pick', dart.id)"
          >
            <span class="num">{{ dart.label }}</span>
            <Icon v-if="dart.hand" name="pencil" :size="12" />
            <s v-if="dart.was" class="sheet-dart-was">{{ dart.was }}</s>
          </button>
        </div>
        <button v-if="visit.markable && canMark" type="button" class="btn-sm sheet-mark" @click="$emit('mark')">{{ t.game.markPhoto }}</button>
      </li>
    </ol>
  </section>
</template>
