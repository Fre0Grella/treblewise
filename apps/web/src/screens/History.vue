<!--
  The matches played on this device, newest first, and each one at its own
  address (/history/:id) so it can be linked and reloaded into.
-->
<script setup lang="ts">
import { matchStats, reduceMatch } from '@treblewise/core';
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import ScreenShell from '../components/ui/ScreenShell.vue';
import { useStrings } from '../i18n/index.js';
import { PATHS } from '../router/paths.js';
import type { StoredMatch } from '../storage/db.js';
import { useMatchesStore } from '../store/stores.js';

const t = useStrings();
const route = useRoute();
const router = useRouter();
const matches = useMatchesStore();

onMounted(() => void matches.refreshHistory());

/** The one match the address names, if it names one. */
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : null));
const shown = computed<StoredMatch[]>(() =>
  id.value ? matches.history.filter((match) => match.id === id.value) : matches.history,
);

const rows = computed(() =>
  shown.value.map((match) => {
    const snapshot = reduceMatch(match.config, match.events);
    return {
      match,
      stats: matchStats(snapshot),
      winner: snapshot.config.players.find((player) => player.id === snapshot.winnerId),
    };
  }),
);

function resume(matchId: string) {
  if (matches.resume(matchId)) void router.push(PATHS.game);
}

const backToList = () => void router.push(PATHS.history);

async function remove(matchId: string) {
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
    <p v-if="rows.length === 0" class="hint">{{ id ? t.history.missing : t.history.empty }}</p>

    <ul class="match-list">
      <li v-for="{ match, stats, winner } in rows" :key="match.id" class="match-row">
        <div>
          <RouterLink class="match-title" :to="`/history/${match.id}`">
            {{ match.config.startScore }} · {{ match.config.players.map((p) => p.name).join(' v ') }}
          </RouterLink>
          <div class="match-meta">
            {{ new Date(match.createdAt).toLocaleString() }} ·
            {{ match.finished ? t.history.finished : t.history.inProgress }}{{ winner ? ` · ${winner.name}` : '' }}
          </div>
          <div class="match-meta">
            <span v-for="p in match.config.players" :key="p.id">{{ p.name }} {{ stats[p.id]!.average.toFixed(1) }}&nbsp;&nbsp;</span>
          </div>
        </div>
        <div class="match-actions">
          <button v-if="!match.finished" type="button" class="chip" @click="resume(match.id)">{{ t.history.resume }}</button>
          <button type="button" class="chip" @click="remove(match.id)">{{ t.history.delete }}</button>
        </div>
      </li>
    </ul>
  </ScreenShell>
</template>
