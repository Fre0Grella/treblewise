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

import WhoStarts from '../components/order/WhoStarts.vue';
import Icon from '../components/ui/Icon.vue';
import ScreenShell from '../components/ui/ScreenShell.vue';
import Segmented from '../components/ui/Segmented.vue';
import Stepper from '../components/ui/Stepper.vue';
import { vFocus } from '../components/ui/focus.js';
import { fill, useStrings } from '../i18n/index.js';
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

/**
 * Deciding who throws first (issue #41): after "Start match" with two or more
 * players, before the match starts. `order` is the lineup as decided.
 */
const ordering = ref(false);
const order = shallowRef<PlayerConfig[] | null>(null);

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
  if (!ordering.value && lineup.value.length > 1) {
    order.value = null;
    ordering.value = true;
    return;
  }
  begin(ordering.value && order.value ? order.value : lineup.value);
}

function begin(inOrder: PlayerConfig[]) {
  // Playing alone without making a profile first is allowed: it is a guest.
  const named = inOrder.map((player) => {
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

function removeProfile(id: string) {
  void players.removeProfile(id);
  dropFromLineup(id);
}

function removeGuest(id: string) {
  players.removeSessionGuest(id);
  dropFromLineup(id);
}

/** The bottom bar: what is about to be played, and by whom. */
const summary = computed(() => t.setup.summary(startScore.value, inRule.value, outRule.value, legsPerSet.value, setsToWin.value));
/** In throwing order, once that is decided. */
const who = computed(() => {
  const shown = ordering.value && order.value ? order.value : lineup.value;
  return shown.length === 0 ? t.setup.nobodyYet : shown.map((player) => player.name).join(' v ');
});

</script>

<template>
  <ScreenShell
    name="setup"
    :title="ordering ? t.setup.order.title : t.setup.title"
    :back-label="ordering ? t.setup.order.back : lobby.session ? t.lobby.back : t.capture.back"
    :on-back="ordering ? () => (ordering = false) : undefined"
  >
    <template #tools>
      <button v-if="matches.history.length > 0" type="button" @click="router.push(PATHS.history)">{{ t.setup.history }}</button>
      <button type="button" @click="router.push(PATHS.stats)">{{ t.stats.title }}</button>
    </template>

    <WhoStarts v-if="ordering" v-model:order="order" :players="lineup" />

    <div v-else class="setup-grid">
      <!-- Who plays, in throwing order. -->
      <section class="panel" :aria-label="t.setup.players">
        <div class="section-head">
          <h2>{{ t.setup.players }}</h2>
          <span class="section-note">{{ t.setup.playersNote }}</span>
        </div>

        <p v-if="lineup.length === 0" class="empty-note">{{ t.setup.noPlayers }}</p>
        <ol v-else class="lineup">
          <li v-for="player in lineup" :key="player.id" class="row">
            <span class="lineup-name">{{ player.name }}</span>
            <span v-if="player.temporary" class="tag">{{ t.setup.guest }}</span>
            <button
              type="button"
              class="btn-quiet btn-icon"
              :aria-label="`${t.setup.removePlayer} ${player.name}`"
              @click="dropFromLineup(player.id)"
            >
              <Icon name="close" :size="18" />
            </button>
          </li>
        </ol>

        <div class="bench">
          <button
            v-for="profile in pickableProfiles"
            :key="profile.id"
            type="button"
            class="btn-sm"
            :aria-label="`${t.setup.addPlayer} ${profile.name}`"
            @click="addToLineup({ id: profile.id, name: profile.name })"
          >
            <Icon name="plus" :size="16" />{{ profile.name }}
          </button>
          <button
            v-for="guest in pickableGuests"
            :key="guest.id"
            type="button"
            class="btn-sm"
            :aria-label="`${t.setup.addPlayer} ${guest.name}`"
            @click="addToLineup(guest)"
          >
            <Icon name="plus" :size="16" />{{ guest.name }} <span class="tag">{{ t.setup.guest }}</span>
          </button>
          <button type="button" class="btn-quiet btn-sm" @click="adding = 'profile'">{{ t.setup.newProfile }}</button>
          <button type="button" class="btn-quiet btn-sm" @click="adding = 'guest'">{{ t.setup.addGuest }}</button>
        </div>

        <div v-if="adding" class="field-row">
          <input
            v-model="draftName"
            v-focus
            :aria-label="adding === 'profile' ? t.setup.newProfile : t.setup.addGuest"
            :placeholder="adding === 'profile' ? t.setup.namePlaceholder : t.setup.guest"
            @keydown.enter="submitDraft"
          />
          <button type="button" class="btn-primary" @click="submitDraft">
            {{ adding === 'profile' ? t.setup.createProfile : t.setup.addForSession }}
          </button>
          <button type="button" class="btn-quiet" @click="cancelDraft">{{ t.setup.cancel }}</button>
        </div>

        <p class="hint">{{ adding === 'guest' ? t.setup.guestHelp : t.setup.profileHelp }}</p>

        <template v-if="players.profiles.length > 0 || players.sessionGuests.length > 0">
          <button type="button" class="btn-quiet btn-sm manage-toggle" @click="managing = !managing">
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
                <button type="button" class="btn-danger" @click="removeProfile(profile.id)">
                  {{ t.setup.deleteProfile }}
                </button>
              </li>
              <li v-for="guest in players.sessionGuests" :key="guest.id">
                <span class="lineup-name">
                  {{ guest.name }}
                  <span class="tag">{{ t.setup.guest }}</span>
                </span>
                <button type="button" class="btn-danger" @click="removeGuest(guest.id)">
                  {{ t.setup.deleteProfile }}
                </button>
              </li>
            </ul>
            <p class="hint">{{ t.setup.manageHelp }}</p>
          </template>
        </template>
      </section>

      <!-- The game: a row per setting, the control on the right. -->
      <section class="panel" :aria-label="t.setup.game">
        <h2>{{ t.setup.game }}</h2>
        <div>
          <div class="setting">
            <span class="setting-label">{{ t.setup.startScore }}</span>
            <Segmented v-model="startScore" :options="scoreOptions" :label="t.setup.startScore" />
          </div>
          <div class="setting">
            <span class="setting-label">
              {{ t.setup.legsPerSet }}
              <span class="setting-note">{{ fill(t.setup.firstTo, { n: legsPerSet }) }}</span>
            </span>
            <Stepper v-model="legsPerSet" :label="t.setup.legsPerSet" :min="1" :max="21" />
          </div>
          <div class="setting">
            <span class="setting-label">
              {{ t.setup.setsToWin }}
              <span class="setting-note">{{ setsToWin === 1 ? t.setup.singleSet : fill(t.setup.firstToSets, { n: setsToWin }) }}</span>
            </span>
            <Stepper v-model="setsToWin" :label="t.setup.setsToWin" :min="1" :max="13" />
          </div>
          <div class="setting">
            <span class="setting-label">
              {{ t.setup.inRule }}
              <span class="setting-note">{{ t.setup.ruleNotes[inRule] }}</span>
            </span>
            <Segmented v-model="inRule" :options="ruleOptions" :label="t.setup.inRule" />
          </div>
          <div class="setting">
            <span class="setting-label">
              {{ t.setup.outRule }}
              <span class="setting-note">{{ t.setup.ruleNotes[outRule] }}</span>
            </span>
            <Segmented v-model="outRule" :options="ruleOptions" :label="t.setup.outRule" />
          </div>
        </div>
      </section>
    </div>

    <!-- What is about to be played, and the one thing this screen is for. -->
    <template #actions>
      <span class="setup-summary">
        <span class="setup-summary-game">{{ summary }}</span>
        <span class="setup-summary-who">{{ who }}</span>
      </span>
      <button type="button" class="btn-primary btn-lg" :disabled="ordering && !order" @click="start">{{ t.setup.start }}</button>
    </template>
  </ScreenShell>
</template>
