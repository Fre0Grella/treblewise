<!--
  The matches played on this device, newest first, and each one at its own
  address (/history/:id) so it can be linked and reloaded into.

  On a wide screen the list stays on the left and the match it names opens
  beside it (issue #20); on a phone the list and the match take turns.
-->
<script setup lang="ts">
import { matchStats, reduceMatch, type MatchSnapshot } from '@treblewise/core';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import HeadToHead, { type HeadToHeadRow } from '../components/HeadToHead.vue';
import ScreenShell from '../components/ui/ScreenShell.vue';
import Segmented from '../components/ui/Segmented.vue';
import { fill, useStrings } from '../i18n/index.js';
import { PATHS } from '../router/paths.js';
import type { StoredMatch } from '../storage/db.js';
import { useMatchesStore } from '../store/stores.js';

type Filter = 'all' | 'live' | 'finished';

const t = useStrings();
const route = useRoute();
const router = useRouter();
const matches = useMatchesStore();

onMounted(() => void matches.refreshHistory());

/** The one match the address names, if it names one. */
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : null));
const filter = ref<Filter>('all');
const filterOptions = [
  { value: 'all' as const, label: t.history.all },
  { value: 'live' as const, label: t.history.inProgressFilter },
  { value: 'finished' as const, label: t.history.finishedFilter },
];
/** The match whose deletion is being confirmed. */
const confirming = ref<string | null>(null);

const DAY = 24 * 60 * 60 * 1000;
function dayLabel(time: number): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (time >= start.getTime()) return t.history.today;
  if (time >= start.getTime() - DAY) return t.history.yesterday;
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

const timeOf = (time: number) => new Date(time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const gameOf = (match: StoredMatch) => `${match.config.startScore} · ${match.config.players.map((p) => p.name).join(' v ')}`;
const scoreOf = (snapshot: MatchSnapshot) =>
  snapshot.config.players
    .map((player) => (snapshot.config.setsToWin > 1 ? snapshot.setsWon[player.id] : snapshot.legsWon[player.id]) ?? 0)
    .join('–');

/** The list, grouped by day. */
const groups = computed(() => {
  const out: { label: string; rows: { match: StoredMatch; score: string }[] }[] = [];
  for (const match of matches.history) {
    if (filter.value === 'live' && match.finished) continue;
    if (filter.value === 'finished' && !match.finished) continue;
    const label = dayLabel(match.createdAt);
    let group = out.find((candidate) => candidate.label === label);
    if (!group) out.push((group = { label, rows: [] }));
    group.rows.push({ match, score: scoreOf(reduceMatch(match.config, match.events)) });
  }
  return out;
});

/** The match the address names, folded, with what the panel shows of it. */
const open = computed(() => {
  if (!id.value) return null;
  const match = matches.history.find((candidate) => candidate.id === id.value);
  if (!match) return null;
  const snapshot = reduceMatch(match.config, match.events);
  const stats = matchStats(snapshot);
  const players = snapshot.config.players;
  const winner = players.find((player) => player.id === snapshot.winnerId);
  const score = scoreOf(snapshot);
  const each = (pick: (id: string) => number | null, text: (value: number | null) => string) => {
    const values = players.map((player) => pick(player.id));
    return { values, texts: values.map(text) };
  };
  const one = (value: number | null) => (value === null ? '–' : value.toFixed(1));
  const whole = (value: number | null) => (value === null || value === 0 ? '–' : String(value));
  const rows: HeadToHeadRow[] = [
    { label: t.headToHead.average, higherIsBetter: true, ...each((p) => (stats[p]!.dartsThrown ? stats[p]!.average : null), one) },
    { label: t.headToHead.first9, higherIsBetter: true, ...each((p) => (stats[p]!.dartsThrown ? stats[p]!.first9Average : null), one) },
    {
      label: t.headToHead.checkout,
      higherIsBetter: true,
      ...each(
        (p) => stats[p]!.checkoutPercent,
        (value) => (value === null ? '–' : `${Math.round(value)}%`),
      ),
    },
    { label: t.headToHead.highestVisit, higherIsBetter: true, ...each((p) => stats[p]!.bestVisit, whole) },
    { label: t.headToHead.highestCheckout, higherIsBetter: true, ...each((p) => stats[p]!.highestCheckout, whole) },
  ];
  return {
    match,
    players,
    title: match.finished
      ? winner
        ? fill(t.history.won, { name: winner.name, score })
        : fill(t.history.noWinner, { score })
      : `${players.map((player) => player.name).join(' v ')} · ${score}`,
    meta: `${match.config.startScore} · ${dayLabel(match.createdAt)}, ${timeOf(match.createdAt)}${match.finished ? '' : ` · ${t.history.inProgress}`}`,
    legs: snapshot.legs.map((leg, index) => {
      const legWinner = players.find((player) => player.id === leg.winnerId);
      return {
        key: `${leg.setIndex}-${leg.legIndex}`,
        n: index + 1,
        winner: legWinner?.name ?? '',
        first: legWinner?.id === players[0]?.id,
        darts: legWinner ? fill(t.history.inDarts, { n: leg.dartsThrown[legWinner.id] ?? 0 }) : t.history.unfinishedLeg,
      };
    }),
    rows,
  };
});

function resume(matchId: string) {
  if (matches.resume(matchId)) void router.push(PATHS.game);
}

const backToList = () => void router.push(PATHS.history);

async function remove(matchId: string) {
  confirming.value = null;
  await matches.remove(matchId);
  if (id.value) void router.push(PATHS.history);
}
</script>

<template>
  <ScreenShell
    name="history"
    :title="t.history.title"
    :back-label="id ? t.history.backToList : t.history.back"
    :on-back="id ? backToList : undefined"
  >
    <div :class="['history', { 'history-open': id }]">
      <!-- The list -->
      <section class="history-list" :aria-label="t.history.title">
        <Segmented v-model="filter" :options="filterOptions" :label="t.history.show" />
        <p v-if="matches.history.length === 0" class="empty-note">{{ t.history.empty }}</p>
        <div v-for="group in groups" :key="group.label" class="history-group">
          <span class="label">{{ group.label }}</span>
          <RouterLink
            v-for="{ match, score } in group.rows"
            :key="match.id"
            :to="`/history/${match.id}`"
            :class="['history-row', { 'history-row-on': match.id === id }]"
            :aria-current="match.id === id ? 'page' : undefined"
          >
            <span class="history-row-text">
              <span class="history-row-title">{{ gameOf(match) }}</span>
              <span class="history-row-meta">{{ timeOf(match.createdAt) }}</span>
            </span>
            <span v-if="!match.finished" class="tag tag-on">{{ t.history.inProgressTag }}</span>
            <span class="num history-row-score">{{ score }}</span>
          </RouterLink>
        </div>
      </section>

      <!-- The match -->
      <section class="history-match" :aria-label="t.history.match">
        <p v-if="id && !open" class="empty-note">{{ t.history.missing }}</p>
        <p v-else-if="!open" class="empty-note history-pick">{{ t.history.pick }}</p>
        <template v-else>
          <div class="history-match-head">
            <div class="history-match-title">
              <h2>{{ open.title }}</h2>
              <span class="history-match-meta">{{ open.meta }}</span>
            </div>
            <div class="history-match-actions">
              <button v-if="!open.match.finished" type="button" class="btn-primary" @click="resume(open.match.id)">
                {{ t.history.resume }}
              </button>
              <template v-if="confirming === open.match.id">
                <button type="button" class="btn-quiet" @click="confirming = null">{{ t.history.keep }}</button>
                <button type="button" class="btn-danger-solid" @click="remove(open.match.id)">{{ t.history.deleteConfirm }}</button>
              </template>
              <button v-else type="button" class="btn-danger" @click="confirming = open.match.id">{{ t.history.delete }}</button>
            </div>
          </div>

          <div class="history-match-body">
            <div class="panel">
              <h2 class="history-subtitle">{{ t.history.legByLeg }}</h2>
              <ol class="history-legs">
                <li v-for="leg in open.legs" :key="leg.key">
                  <span class="history-leg-n">{{ fill(t.history.leg, { n: leg.n }) }}</span>
                  <span :class="['history-leg-winner', { 'history-leg-first': leg.first }]">{{ leg.winner }}</span>
                  <span class="history-leg-darts">{{ leg.darts }}</span>
                </li>
              </ol>
            </div>
            <HeadToHead :players="open.players" :rows="open.rows" :caption="t.history.match" />
          </div>
        </template>
      </section>
    </div>
  </ScreenShell>
</template>
