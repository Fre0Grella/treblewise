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

  The game is picked first (issue #22): X01, another game, or a drill, and
  then set up with that game's own settings.
-->
<script setup lang="ts">
import {
  TRAINING_MODES,
  drawKillerNumbers,
  type ClockOrder,
  type ClockRing,
  type CricketScoring,
  type GameConfig,
  type GameMode,
  type HalveItPreset,
  type InOutRule,
  type KillerRing,
  type PlayerConfig,
  type TeamConfig,
} from '@treblewise/core';
import { computed, ref, shallowRef } from 'vue';
import { useRouter } from 'vue-router';

import ModeRules from '../components/ModeRules.vue';
import WhoStarts from '../components/order/WhoStarts.vue';
import Icon from '../components/ui/Icon.vue';
import ScreenShell from '../components/ui/ScreenShell.vue';
import Segmented from '../components/ui/Segmented.vue';
import Stepper from '../components/ui/Stepper.vue';
import Switch from '../components/ui/Switch.vue';
import { vFocus } from '../components/ui/focus.js';
import { gameSummary, halveTargetsShort } from '../game/modeView.js';
import { lineupLabel } from '../game/sides.js';
import { MAX_TEAMS, draftTeams, moveToNext, newDraft, orderTeams, resize, shuffleTeams, type TeamDraft } from '../game/teamDraft.js';
import { fill, useStrings } from '../i18n/index.js';
import { PATHS } from '../router/paths.js';
import { useLobbyStore, useMatchesStore, usePlayersStore } from '../store/stores.js';

const START_SCORES = [301, 401, 501, 701, 1001];
const MATCH_MODES: GameMode[] = ['x01', 'cricket', 'aroundTheClock', 'shanghai', 'killer'];
const RULES: InOutRule[] = ['straight', 'double', 'treble', 'master'];
const MAX_PLAYERS = 8;
/** Past this many, the lineup wraps into a second column, so eight players do not push the settings off the window. */
const LINEUP_COLUMN = 4;

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

/** The game, and each game's own settings (issue #22). */
const mode = ref<GameMode>('x01');
/** The game whose rules are open, from the info button on its tile. */
const rulesOf = ref<GameMode | null>(null);
const modeLegs = ref(1);
const cricketScoring = ref<CricketScoring>('standard');
const clockRing = ref<ClockRing>('any');
const clockOrder = ref<ClockOrder>('up');
const clockBull = ref(false);
const clockHits = ref(1);
const clockMultiples = ref(false);
const shanghaiRounds = ref(7);
const shanghaiWins = ref(true);
const killerLives = ref(3);
const killerRing = ref<KillerRing>('double');
const killerHits = ref(1);
const killerSelfHit = ref(true);
const killerNumbers = ref<'drawn' | 'thrown'>('drawn');
const bobsBull = ref(false);
const bobsPlayOn = ref(false);
const halvePreset = ref<HalveItPreset>('classic');
const countUpRounds = ref(8);

const scoreOptions = START_SCORES.map((score) => ({ value: score, label: String(score) }));
const ruleOptions = RULES.map((rule) => ({ value: rule, label: t.setup.rules[rule] }));
const m = t.modes;
const modeTile = (value: GameMode) => ({ value, name: m.names[value], blurb: m.blurbs[value] });
const tileGroups = [
  { label: m.matchGames, tiles: MATCH_MODES.map(modeTile) },
  { label: m.training, tiles: TRAINING_MODES.map(modeTile) },
];
const scoringOptions = (['standard', 'cutThroat', 'noScore'] as const).map((value) => ({ value, label: m.cricket.scorings[value] }));
const clockRingOptions = (['any', 'single', 'double', 'treble'] as const).map((value) => ({ value, label: m.clock.rings[value] }));
const clockOrderOptions = (['up', 'down', 'board'] as const).map((value) => ({ value, label: m.clock.orders[value] }));
const hitsOptions = [1, 2, 3].map((value) => ({ value, label: String(value) }));
const killerRingOptions = (['double', 'any'] as const).map((value) => ({ value, label: m.killer.rings[value] }));
const numbersOptions = (['drawn', 'thrown'] as const).map((value) => ({ value, label: m.killer.numberChoices[value] }));
const presetOptions = (['classic', 'long'] as const).map((value) => ({ value, label: m.halveIt.presets[value] }));
const countUpOptions = [5, 8, 10, 20].map((value) => ({ value, label: String(value) }));

/**
 * Teams (game/teams.ts): every game but Killer, from three players. With them
 * on, the teams take turns, each one's players taking its visits in turn.
 */
const teamsOn = ref(false);
const teamDraft = ref<TeamDraft>(newDraft());
const TEAM_COLOURS = ['var(--player-a)', 'var(--player-b)', 'var(--checkout)', 'var(--busy)'];
const teamsAllowed = computed(() => mode.value !== 'killer');
const playingTeams = computed(() => teamsOn.value && teamsAllowed.value && lineup.value.length >= 3);
const teamList = computed<TeamConfig[]>(() => draftTeams(lineup.value, teamDraft.value, (n) => fill(t.setup.teams.team, { n })));
const teamsReady = computed(() => !playingTeams.value || teamList.value.every((team) => team.members.length > 0));
const memberOf = (id: string) => lineup.value.find((player) => player.id === id)!;
const nextTeamName = (k: number) => teamList.value[(k + 1) % teamList.value.length]?.name ?? '';
const moveOn = (id: string) => (teamDraft.value = moveToNext(teamDraft.value, teamList.value, id));
const shuffle = () => (teamDraft.value = shuffleTeams(teamDraft.value, lineup.value));
const resizeTeams = (by: 1 | -1) => (teamDraft.value = resize(teamDraft.value, by, lineup.value.length));
/**
 * The players in the order decided so far. Who throws first is decided
 * between the players even in teams, so the teams follow from it
 * (orderTeams): the first player's team throws first, with them leading it.
 */
const decided = computed(() => (ordering.value && order.value ? order.value : lineup.value));
const decidedTeams = computed(() => (playingTeams.value ? orderTeams(teamList.value, decided.value) : undefined));

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
  if (!teamsReady.value) return;
  if (!ordering.value && lineup.value.length > 1) {
    order.value = null;
    ordering.value = true;
    return;
  }
  begin(decided.value, decidedTeams.value);
}

/** Starts the game, the players taking turns in `inOrder`, or the `teams` they make up. */
function begin(inOrder: readonly PlayerConfig[], teams?: TeamConfig[]) {
  // Playing alone without making a profile first is allowed: it is a guest.
  const named = (list: readonly PlayerConfig[]) =>
    list.map((player) => {
      const profile = players.profiles.find((candidate) => candidate.id === player.id);
      return profile ? { ...player, name: profile.name } : player;
    });
  const playing = named(inOrder);
  matches.start(configFor(playing.length > 0 ? playing : [{ id: 'guest-solo', name: t.setup.guest, temporary: true }], teams));
  void router.push(PATHS.game);
}

/** The game as set up, for these players in this order, and the teams they make up, if any. */
function configFor(playing: PlayerConfig[], teams?: TeamConfig[]): GameConfig {
  const lineupOf = { players: playing, ...(teams ? { teams } : {}) };
  const base = { ...lineupOf, legsToWin: modeLegs.value };
  switch (mode.value) {
    case 'x01':
      return {
        startScore: startScore.value,
        inRule: inRule.value,
        outRule: outRule.value,
        legsPerSet: legsPerSet.value,
        setsToWin: setsToWin.value,
        ...lineupOf,
      };
    case 'cricket':
      return { ...base, mode: 'cricket', scoring: cricketScoring.value };
    case 'aroundTheClock':
      return {
        ...base,
        mode: 'aroundTheClock',
        ring: clockRing.value,
        order: clockOrder.value,
        bull: clockBull.value,
        hitsPerTarget: clockHits.value,
        multiples: clockMultiples.value && clockRing.value === 'any',
      };
    case 'shanghai':
      return { ...base, mode: 'shanghai', rounds: shanghaiRounds.value, shanghaiWins: shanghaiWins.value };
    case 'killer':
      return {
        ...base,
        mode: 'killer',
        lives: killerLives.value,
        ring: killerRing.value,
        hitsToKill: killerHits.value,
        selfHit: killerSelfHit.value,
        numbers: killerNumbers.value,
        ...(killerNumbers.value === 'drawn' ? { assigned: drawKillerNumbers(playing.map((player) => player.id)) } : {}),
      };
    case 'bobs27':
      return { ...base, legsToWin: 1, mode: 'bobs27', bull: bobsBull.value, playOn: bobsPlayOn.value };
    case 'halveIt':
      return { ...base, legsToWin: 1, mode: 'halveIt', preset: halvePreset.value };
    case 'countUp':
      return { ...base, legsToWin: 1, mode: 'countUp', rounds: countUpRounds.value };
  }
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
const summary = computed(() => gameSummary(configFor([])));
/** The recap block puts the game's name big, so its line of settings goes without it. */
const recapDetails = computed(() => {
  const name = `${m.names[mode.value]} · `;
  return summary.value.startsWith(name) ? summary.value.slice(name.length) : summary.value;
});
const training = computed(() => TRAINING_MODES.includes(mode.value));
/** In throwing order, once that is decided. */
const who = computed(() => {
  if (lineup.value.length === 0) return t.setup.nobodyYet;
  if (decidedTeams.value) return lineupLabel({ players: lineup.value, teams: decidedTeams.value });
  return decided.value.map((player) => player.name).join(' v ');
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

    <div v-else class="setup-layout">
      <div class="setup-grid">
        <!-- Who plays, in throwing order. -->
        <section class="panel" :aria-label="t.setup.players">
          <div class="section-head">
            <h2>{{ t.setup.players }}</h2>
            <Switch v-if="teamsAllowed" v-model="teamsOn" class="teams-switch" :label="t.setup.teams.switch" />
            <span v-else class="section-note">{{ fill(t.setup.teams.notHere, { game: m.names[mode] }) }}</span>
          </div>

          <p v-if="lineup.length === 0" class="empty-note">{{ t.setup.noPlayers }}</p>
          <template v-else-if="playingTeams">
            <div class="team-columns">
              <div v-for="(team, k) in teamList" :key="team.id" class="team-column" :style="{ '--team': TEAM_COLOURS[k] }">
                <div class="team-head">
                  <span class="team-dot" aria-hidden="true" />
                  <span class="label">{{ team.name }}</span>
                  <span class="team-count">{{ t.setup.teams.count(team.members.length) }}</span>
                </div>
                <div v-for="id in team.members" :key="id" class="row team-row">
                  <span class="lineup-name">{{ memberOf(id).name }}</span>
                  <span v-if="memberOf(id).temporary" class="tag">{{ t.setup.guest }}</span>
                  <button
                    type="button"
                    class="btn-quiet btn-icon"
                    :aria-label="fill(t.setup.teams.move, { name: memberOf(id).name, team: nextTeamName(k) })"
                    :title="fill(t.setup.teams.move, { name: memberOf(id).name, team: nextTeamName(k) })"
                    @click="moveOn(id)"
                  >
                    <Icon name="order" :size="18" />
                  </button>
                  <button type="button" class="btn-quiet btn-icon" :aria-label="`${t.setup.removePlayer} ${memberOf(id).name}`" @click="dropFromLineup(id)">
                    <Icon name="close" :size="18" />
                  </button>
                </div>
              </div>
            </div>
            <div class="team-tools">
              <button type="button" class="btn-sm" :disabled="teamList.length >= Math.min(MAX_TEAMS, lineup.length)" @click="resizeTeams(1)">
                <Icon name="plus" :size="16" />{{ t.setup.teams.add }}
              </button>
              <button v-if="teamList.length > 2" type="button" class="btn-sm btn-quiet" @click="resizeTeams(-1)">{{ t.setup.teams.remove }}</button>
              <button type="button" class="btn-sm" @click="shuffle">{{ t.setup.teams.shuffle }}</button>
            </div>
            <p v-if="!teamsReady" class="hint">{{ t.setup.teams.emptyTeam }}</p>
          </template>
          <p v-if="teamsOn && teamsAllowed && lineup.length < 3" class="hint">{{ t.setup.teams.needMore }}</p>
          <ol
            v-if="lineup.length > 0 && !playingTeams"
            :class="['lineup', { 'lineup-wrapped': lineup.length > LINEUP_COLUMN }]"
            :style="lineup.length > LINEUP_COLUMN ? { gridTemplateRows: `repeat(${Math.ceil(lineup.length / 2)}, auto)` } : undefined"
          >
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

        <!-- The game, picked first; then its settings, a row each, the control on the right. -->
        <section class="panel" :aria-label="t.setup.game">
          <h2>{{ t.setup.game }}</h2>
          <div class="mode-pick" role="radiogroup" :aria-label="m.pick">
            <template v-for="group in tileGroups" :key="group.label">
              <span class="label mode-pick-group">{{ group.label }}</span>
              <div class="mode-tiles">
                <div v-for="tile in group.tiles" :key="tile.value" :class="['mode-tile-wrap', { 'mode-tile-on': mode === tile.value }]">
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="mode === tile.value"
                    class="mode-tile"
                    @click="mode = tile.value"
                  >
                    <span class="mode-tile-name">{{ tile.name }}</span>
                    <span class="mode-tile-blurb">{{ tile.blurb }}</span>
                  </button>
                  <button
                    type="button"
                    class="mode-info"
                    :aria-label="fill(m.howToPlay, { name: tile.name })"
                    :title="fill(m.howToPlay, { name: tile.name })"
                    @click="rulesOf = tile.value"
                  >
                    <Icon name="info" :size="18" />
                  </button>
                </div>
              </div>
            </template>
          </div>
        </section>
      </div>

      <!-- The chosen game's settings, across the whole width under the two columns. -->
      <section class="panel setup-settings" :aria-label="fill(m.settingsTitle, { name: m.names[mode] })">
        <div class="setup-settings-body">
          <div class="setup-settings-main">
            <h2>{{ fill(m.settingsTitle, { name: m.names[mode] }) }}</h2>
            <div v-if="mode === 'x01'" class="setting-grid">
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

            <div v-else class="setting-grid">
              <template v-if="mode === 'cricket'">
                <div class="setting">
                  <span class="setting-label">
                    {{ m.cricket.scoring }}
                    <span class="setting-note">{{ m.cricket.scoringNotes[cricketScoring] }}</span>
                  </span>
                  <Segmented v-model="cricketScoring" :options="scoringOptions" :label="m.cricket.scoring" />
                </div>
              </template>

              <template v-if="mode === 'aroundTheClock'">
                <div class="setting">
                  <span class="setting-label">
                    {{ m.clock.ring }}
                    <span class="setting-note">{{ m.clock.ringNotes[clockRing] }}</span>
                  </span>
                  <Segmented v-model="clockRing" :options="clockRingOptions" :label="m.clock.ring" />
                </div>
                <div class="setting">
                  <span class="setting-label">
                    {{ m.clock.order }}
                    <span class="setting-note">{{ m.clock.orderNotes[clockOrder] }}</span>
                  </span>
                  <Segmented v-model="clockOrder" :options="clockOrderOptions" :label="m.clock.order" />
                </div>
                <div class="setting">
                  <span class="setting-label">
                    {{ m.clock.hitsPerTarget }}
                    <span class="setting-note">{{ m.clock.hitsNote }}</span>
                  </span>
                  <Segmented v-model="clockHits" :options="hitsOptions" :label="m.clock.hitsPerTarget" />
                </div>
                <Switch v-model="clockBull" class="setting-switch" :label="m.clock.bull" :note="m.clock.bullNote" />
                <Switch
                  v-model="clockMultiples"
                  class="setting-switch"
                  :label="m.clock.multiples"
                  :note="m.clock.multiplesNote"
                  :disabled="clockRing !== 'any'"
                />
              </template>

              <template v-if="mode === 'shanghai'">
                <div class="setting">
                  <span class="setting-label">
                    {{ m.shanghai.rounds }}
                    <span class="setting-note">{{ fill(m.shanghai.roundsNote, { n: shanghaiRounds }) }}</span>
                  </span>
                  <Stepper v-model="shanghaiRounds" :label="m.shanghai.rounds" :min="1" :max="20" />
                </div>
                <Switch v-model="shanghaiWins" class="setting-switch" :label="m.shanghai.shanghaiWins" :note="m.shanghai.shanghaiNote" />
              </template>

              <template v-if="mode === 'killer'">
                <div class="setting">
                  <span class="setting-label">{{ m.killer.lives }}</span>
                  <Stepper v-model="killerLives" :label="m.killer.lives" :min="1" :max="9" />
                </div>
                <div class="setting">
                  <span class="setting-label">
                    {{ m.killer.ring }}
                    <span class="setting-note">{{ m.killer.ringNotes[killerRing] }}</span>
                  </span>
                  <Segmented v-model="killerRing" :options="killerRingOptions" :label="m.killer.ring" />
                </div>
                <div class="setting">
                  <span class="setting-label">
                    {{ m.killer.hitsToKill }}
                    <span class="setting-note">{{ m.killer.hitsNote }}</span>
                  </span>
                  <Stepper v-model="killerHits" :label="m.killer.hitsToKill" :min="1" :max="5" />
                </div>
                <div class="setting">
                  <span class="setting-label">
                    {{ m.killer.numbers }}
                    <span class="setting-note">{{ m.killer.numberNotes[killerNumbers] }}</span>
                  </span>
                  <Segmented v-model="killerNumbers" :options="numbersOptions" :label="m.killer.numbers" />
                </div>
                <Switch v-model="killerSelfHit" class="setting-switch" :label="m.killer.selfHit" :note="m.killer.selfHitNote" />
              </template>

              <template v-if="mode === 'bobs27'">
                <Switch v-model="bobsBull" class="setting-switch" :label="m.bobs27.bull" :note="m.bobs27.bullNote" />
                <Switch v-model="bobsPlayOn" class="setting-switch" :label="m.bobs27.playOn" :note="m.bobs27.playOnNote" />
              </template>

              <template v-if="mode === 'halveIt'">
                <div class="setting">
                  <span class="setting-label">
                    {{ m.halveIt.targets }}
                    <span class="setting-note">{{ halveTargetsShort(halvePreset) }}</span>
                  </span>
                  <Segmented v-model="halvePreset" :options="presetOptions" :label="m.halveIt.targets" />
                </div>
              </template>

              <template v-if="mode === 'countUp'">
                <div class="setting">
                  <span class="setting-label">
                    {{ m.countUp.rounds }}
                    <span class="setting-note">{{ fill(m.countUp.roundsNote, { n: countUpRounds * 3 }) }}</span>
                  </span>
                  <Segmented v-model="countUpRounds" :options="countUpOptions" :label="m.countUp.rounds" />
                </div>
              </template>

              <div v-if="!training" class="setting">
                <span class="setting-label">
                  {{ m.legsToWin }}
                  <span class="setting-note">{{ fill(t.setup.firstTo, { n: modeLegs }) }}</span>
                </span>
                <Stepper v-model="modeLegs" :label="m.legsToWin" :min="1" :max="21" />
              </div>
            </div>
          </div>

          <!-- What is about to be played, and the one thing this screen is for. -->
          <div class="setup-recap">
            <span class="label">{{ t.setup.recap }}</span>
            <span class="setup-summary">
              <span class="setup-summary-game">{{ m.names[mode] }}</span>
              <span class="setup-recap-details">{{ recapDetails }}</span>
              <span class="setup-summary-who">{{ who }}</span>
            </span>
            <button type="button" class="btn-primary btn-xl setup-start" :disabled="!teamsReady" @click="start">{{ t.setup.start }}</button>
          </div>
        </div>
      </section>
    </div>

    <ModeRules v-if="rulesOf" :mode="rulesOf" @close="rulesOf = null" />

    <!-- Deciding who throws first: the recap and Start at the foot, as a bar. -->
    <template v-if="ordering" #actions>
      <span class="setup-summary">
        <span class="setup-summary-game">{{ summary }}</span>
        <span class="setup-summary-who">{{ who }}</span>
      </span>
      <button type="button" class="btn-primary btn-lg" :disabled="!order" @click="start">{{ t.setup.start }}</button>
    </template>
  </ScreenShell>
</template>
