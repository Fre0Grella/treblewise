<!--
  Starting a match: who is playing, and under what rules.

  Players are **profiles** chosen from a list rather than names typed each
  time, because a name typed each time is a different player every time as far
  as the statistics are concerned. A profile's id is fixed when it is made, so
  renaming one keeps its history.

  A friend who plays once is a **guest**: named once, pickable for the rest of
  the session like anybody else, and gone when the tab closes. Guests are never
  written to the profile list and never appear in the statistics, so the picker
  stays short.
-->
<script setup lang="ts">
import type { InOutRule, PlayerConfig, X01Config } from '@treblewise/core';
import { computed, ref, shallowRef } from 'vue';
import { useRouter } from 'vue-router';

import ScreenShell from '../components/ui/ScreenShell.vue';
import Segmented from '../components/ui/Segmented.vue';
import { vFocus } from '../components/ui/focus.js';
import { useStrings } from '../i18n/index.js';
import { PATHS } from '../router/paths.js';
import { useLobbyStore, useMatchesStore, usePlayersStore } from '../store/stores.js';

const START_SCORES = [301, 401, 501, 701, 1001];
const RULES: InOutRule[] = ['straight', 'double', 'treble', 'master'];
const MAX_PLAYERS = 8;

const t = useStrings();
const router = useRouter();
const lobby = useLobbyStore();
const matches = useMatchesStore();
const players = usePlayersStore();

/** Who is throwing, in order. Profiles and guests look the same here. */
// Shallow: the players go into the stored match as they are, and a deep ref
// would make each one a Vue proxy, which IndexedDB refuses to store.
const lineup = shallowRef<PlayerConfig[]>([]);
const adding = ref<'profile' | 'guest' | null>(null);
const draftName = ref('');
const managing = ref(false);
/**
 * Names being typed in manage mode. The field cannot write straight through to
 * the profile: the store trims, so a trailing space would be swallowed and
 * "Marco G." could never be typed at all.
 */
const drafts = ref<Record<string, string>>({});

const startScore = ref(501);
const inRule = ref<InOutRule>('straight');
const outRule = ref<InOutRule>('double');
const legsPerSet = ref(3);
const setsToWin = ref(1);

const scoreOptions = START_SCORES.map((score) => ({ value: score, label: String(score) }));
const ruleOptions = RULES.map((rule) => ({ value: rule, label: t.setup.rules[rule] }));

const inLineup = (id: string) => lineup.value.some((player) => player.id === id);
const pickableProfiles = computed(() => players.profiles.filter((profile) => !inLineup(profile.id)));
const pickableGuests = computed(() => players.sessionGuests.filter((guest) => !inLineup(guest.id)));

function addToLineup(player: PlayerConfig) {
  if (inLineup(player.id) || lineup.value.length >= MAX_PLAYERS) return;
  lineup.value = [...lineup.value, player];
}

const dropFromLineup = (id: string) => {
  lineup.value = lineup.value.filter((player) => player.id !== id);
};

function addGuest(name: string) {
  if (lineup.value.length >= MAX_PLAYERS) return;
  addToLineup(players.addSessionGuest(name.trim() || t.setup.guest));
}

async function submitDraft() {
  if (adding.value === 'profile') {
    const profile = await players.createProfile(draftName.value);
    addToLineup({ id: profile.id, name: profile.name });
  } else if (adding.value === 'guest') {
    addGuest(draftName.value);
  }
  draftName.value = '';
  adding.value = null;
}

function cancelDraft() {
  adding.value = null;
  draftName.value = '';
}

function commitDraft(id: string) {
  const draft = drafts.value[id];
  const { [id]: _, ...rest } = drafts.value;
  drafts.value = rest;
  if (draft !== undefined) void players.renameProfile(id, draft);
}

function start() {
  // Playing alone without making a profile first is allowed: it is a guest.
  const named = lineup.value.map((player) => {
    const profile = players.profiles.find((candidate) => candidate.id === player.id);
    return profile ? { ...player, name: profile.name } : player;
  });
  const config: X01Config = {
    startScore: startScore.value,
    inRule: inRule.value,
    outRule: outRule.value,
    legsPerSet: legsPerSet.value,
    setsToWin: setsToWin.value,
    players: named.length > 0 ? named : [{ id: 'guest-solo', name: t.setup.guest, temporary: true }],
  };
  matches.start(config);
  void router.push(PATHS.game);
}

const atLeastOne = (value: string) => Math.max(1, Number(value) || 1);

</script>

<template>
  <ScreenShell
    name="setup"
    :title="t.app.name"
    :lead="t.app.tagline"
    :back-label="lobby.session ? t.lobby.back : t.capture.back"
  >
    <section class="panel">
      <h2>{{ t.setup.players }}</h2>

      <p v-if="lineup.length === 0" class="hint">{{ t.setup.noPlayers }}</p>
      <ol v-else class="lineup">
        <li v-for="(player, index) in lineup" :key="player.id">
          <span class="lineup-order">{{ index + 1 }}</span>
          <span class="lineup-name">
            {{ player.name }}
            <small v-if="player.temporary">{{ t.setup.guestTag }}</small>
          </span>
          <button
            type="button"
            class="chip"
            :aria-label="`${t.setup.removePlayer} ${player.name}`"
            @click="dropFromLineup(player.id)"
          >
            ✕
          </button>
        </li>
      </ol>

      <div class="chip-row">
        <button
          v-for="profile in pickableProfiles"
          :key="profile.id"
          type="button"
          class="chip"
          @click="addToLineup({ id: profile.id, name: profile.name })"
        >
          + {{ profile.name }}
        </button>
        <button v-for="guest in pickableGuests" :key="guest.id" type="button" class="chip" @click="addToLineup(guest)">
          + {{ guest.name }}
          <small>{{ t.setup.guestTag }}</small>
        </button>
        <button type="button" class="chip" @click="adding = 'profile'">{{ t.setup.newProfile }}</button>
        <button type="button" class="chip" @click="adding = 'guest'">{{ t.setup.addGuest }}</button>
      </div>

      <div v-if="adding" class="field-row">
        <input
          v-model="draftName"
          v-focus
          :aria-label="adding === 'profile' ? t.setup.newProfile : t.setup.addGuest"
          :placeholder="adding === 'profile' ? t.setup.namePlaceholder : t.setup.guest"
          @keydown.enter="submitDraft"
        />
        <button type="button" class="chip chip-on" @click="submitDraft">
          {{ adding === 'profile' ? t.setup.createProfile : t.setup.addForSession }}
        </button>
        <button type="button" class="chip" @click="cancelDraft">{{ t.setup.cancel }}</button>
      </div>

      <p class="hint">{{ adding === 'guest' ? t.setup.guestHelp : t.setup.profileHelp }}</p>

      <template v-if="players.profiles.length > 0 || players.sessionGuests.length > 0">
        <button type="button" class="chip" @click="managing = !managing">
          {{ managing ? t.setup.doneManaging : t.setup.manageProfiles }}
        </button>

        <template v-if="managing">
          <ul class="player-list">
            <li v-for="profile in players.profiles" :key="profile.id">
              <input
                :aria-label="`${t.setup.playerName} ${profile.name}`"
                :value="drafts[profile.id] ?? profile.name"
                @input="drafts = { ...drafts, [profile.id]: ($event.target as HTMLInputElement).value }"
                @blur="commitDraft(profile.id)"
                @keydown.enter="($event.target as HTMLInputElement).blur()"
              />
              <button
                type="button"
                class="chip"
                @click="
                  players.removeProfile(profile.id);
                  dropFromLineup(profile.id);
                "
              >
                {{ t.setup.deleteProfile }}
              </button>
            </li>
            <li v-for="guest in players.sessionGuests" :key="guest.id">
              <span class="lineup-name">
                {{ guest.name }}
                <small>{{ t.setup.guestTag }}</small>
              </span>
              <button
                type="button"
                class="chip"
                @click="
                  players.removeSessionGuest(guest.id);
                  dropFromLineup(guest.id);
                "
              >
                {{ t.setup.deleteProfile }}
              </button>
            </li>
          </ul>
          <p class="hint">{{ t.setup.manageHelp }}</p>
        </template>
      </template>
    </section>

    <section class="panel">
      <h2>{{ t.setup.startScore }}</h2>
      <Segmented v-model="startScore" :options="scoreOptions" :label="t.setup.startScore" />
    </section>

    <section class="panel">
      <h2>{{ t.setup.inRule }}</h2>
      <Segmented v-model="inRule" :options="ruleOptions" :label="t.setup.inRule" />
      <h2>{{ t.setup.outRule }}</h2>
      <Segmented v-model="outRule" :options="ruleOptions" :label="t.setup.outRule" />
    </section>

    <section class="panel">
      <div class="field-row">
        <label>
          {{ t.setup.legsPerSet }}
          <input
            type="number"
            :min="1"
            :max="21"
            :value="legsPerSet"
            @input="legsPerSet = atLeastOne(($event.target as HTMLInputElement).value)"
          />
        </label>
        <label>
          {{ t.setup.setsToWin }}
          <input
            type="number"
            :min="1"
            :max="13"
            :value="setsToWin"
            @input="setsToWin = atLeastOne(($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </section>

    <template #actions>
      <button type="button" class="primary" @click="start">{{ t.setup.start }}</button>
      <button v-if="matches.history.length > 0" type="button" class="chip" @click="router.push(PATHS.history)">
        {{ t.setup.history }}
      </button>
      <button type="button" class="chip" @click="router.push(PATHS.stats)">{{ t.stats.title }}</button>
      <button type="button" class="chip" @click="router.push(PATHS.camera)">{{ t.capture.title }}</button>
    </template>
  </ScreenShell>
</template>
