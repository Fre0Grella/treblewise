<!--
  The statistics page.

  Two halves, as docs/04-stats.md sets out. The classical numbers work from
  scores alone, so they are there from the first leg. The positional ones need
  to know where each dart landed: heatmap, grouping, and the aiming map that is
  the reason this project stores coordinates at all.

  Every number carries its sample size, and every contested definition says
  what it means next to itself rather than in a help page nobody opens.

  The other games (issue #22) each have their own page, picked under Game
  (ModeStats.vue): their darts never go into the X01 averages.
-->
<script setup lang="ts">
import {
  GAME_MODES,
  careerStats,
  densityGrid,
  estimateSpread,
  expectedScoreMap,
  formatHit,
  hit as makeHit,
  isX01Snapshot,
  legStats,
  modeStats,
  positionedDarts,
  reduceGame,
  scoreAt,
  sectorAtAngle,
  sectorSplit,
  targetPoint,
  type GameMode,
  type GameSnapshot,
  type MatchSnapshot,
  type ModeSnapshot,
} from '@treblewise/core';
import { computed, onMounted, ref } from 'vue';

import BandBars from '../components/charts/BandBars.vue';
import BoardMap from '../components/charts/BoardMap.vue';
import LegTrend, { type LegPoint } from '../components/charts/LegTrend.vue';
import PercentBars from '../components/charts/PercentBars.vue';
import { boardMin, rampStops } from '../components/charts/heatRamp.js';
import StatTile from '../components/charts/StatTile.vue';
import ModeStats from '../components/ModeStats.vue';
import ScreenShell from '../components/ui/ScreenShell.vue';
import Segmented from '../components/ui/Segmented.vue';
import { fill, useStrings } from '../i18n/index.js';
import { useMatchesStore, usePlayersStore } from '../store/stores.js';

type Range = 'session' | 'month' | 'all';

/** Darts needed before the spread is worth estimating, per the paper: ~50. */
const AIM_MAP_MINIMUM = 50;

function lastDartAt(snapshot: GameSnapshot): number {
  let latest = 0;
  for (const leg of snapshot.legs) {
    for (const visit of leg.visits) {
      for (const dart of visit.darts) latest = Math.max(latest, dart.ts);
    }
  }
  return latest;
}

const number = (value: number, digits = 1) => value.toFixed(digits);

const t = useStrings();
const matches = useMatchesStore();
const players = usePlayersStore();

onMounted(() => void matches.refreshHistory());

const chosenPlayer = ref<string | null>(null);
const range = ref<Range>('all');
const rangeOptions = (['session', 'month', 'all'] as Range[]).map((value) => ({ value, label: t.stats.ranges[value] }));

/** Every match folded once, with its own game. */
const folded = computed(() => matches.history.map((match) => ({ match, snapshot: reduceGame(match.config, match.events) })));
/** The X01 matches: averages, checkouts and where the darts land are X01's. */
const x01Matches = computed(() =>
  folded.value.flatMap(({ match, snapshot }) => (isX01Snapshot(snapshot) ? [{ match, snapshot }] : [])),
);
const snapshots = computed<MatchSnapshot[]>(() => x01Matches.value.map(({ snapshot }) => snapshot));

const people = computed(() => {
  const seen = new Map<string, { id: string; name: string; darts: number }>();
  for (const { snapshot } of folded.value) {
    for (const player of snapshot.config.players) {
      // Guests are scored like anyone else and then forgotten: they are here
      // to play, not to be measured, and they would fill this list up.
      if (player.temporary) continue;
      // The profile's current name wins over the one stored with the match:
      // a rename is meant to be visible everywhere, not only from now on.
      const name = players.profiles.find((profile) => profile.id === player.id)?.name ?? player.name;
      const entry = seen.get(player.id) ?? { id: player.id, name, darts: 0 };
      entry.name = name;
      // Their own darts: in a team match, not their teammates'.
      for (const leg of snapshot.legs) {
        for (const visit of leg.visits) if (visit.throwerId === player.id) entry.darts += visit.darts.length;
      }
      seen.set(player.id, entry);
    }
  }
  return [...seen.values()].sort((a, b) => b.darts - a.darts);
});
const peopleOptions = computed(() => people.value.map((person) => ({ value: person.id, label: person.name })));

const active = computed({
  get: () => chosenPlayer.value ?? people.value[0]?.id ?? '',
  set: (id: string) => {
    chosenPlayer.value = id;
  },
});

const cutoff = computed(() => {
  if (range.value === 'all') return 0;
  const now = Date.now();
  return range.value === 'month' ? now - 30 * 24 * 3600_000 : now - 12 * 3600_000;
});
const inRange = computed(() => snapshots.value.filter((snapshot) => lastDartAt(snapshot) >= cutoff.value));

/**
 * The games the chosen player has thrown in, in the period: X01 first, then
 * the others in the setup's order. Each has its own page.
 */
const othersInRange = computed(() =>
  folded.value.flatMap(({ snapshot }) => (!isX01Snapshot(snapshot) && lastDartAt(snapshot) >= cutoff.value ? [snapshot as ModeSnapshot] : [])),
);
const played = (snapshot: GameSnapshot) => snapshot.config.players.some((player) => player.id === active.value);
const games = computed<GameMode[]>(() =>
  GAME_MODES.filter((mode) => (mode === 'x01' ? inRange.value.some(played) : othersInRange.value.some((s) => s.config.mode === mode && played(s)))),
);
const chosenGame = ref<GameMode>('x01');
const game = computed({
  get: () => (games.value.includes(chosenGame.value) ? chosenGame.value : (games.value[0] ?? 'x01')),
  set: (mode: GameMode) => {
    chosenGame.value = mode;
  },
});
const gameOptions = computed(() => games.value.map((mode) => ({ value: mode, label: t.modes.names[mode] })));
const otherGame = computed(() => (game.value === 'x01' ? null : modeStats(othersInRange.value, game.value, active.value)));
/** The line under the title: the chosen game's games and darts. */
const lead = computed(() =>
  otherGame.value
    ? t.stats.gameSubtitle(otherGame.value.legs, otherGame.value.darts)
    : fill(t.stats.subtitle, { matches: career.value?.matches ?? 0, darts: career.value?.dartsThrown ?? 0 }),
);

/** The chosen player's legs in the period, oldest first: one point each on the chart. */
const legPoints = computed<LegPoint[]>(() =>
  x01Matches.value
    .flatMap(({ match }, index) =>
      legStats(snapshots.value[index]!, active.value).map((leg) => ({
        matchId: match.id,
        at: leg.at,
        average: leg.average,
        checkoutPercent: leg.checkoutPercent,
      })),
    )
    .filter((leg) => leg.at >= cutoff.value)
    .sort((a, b) => a.at - b.at),
);

const career = computed(() => (active.value ? careerStats(inRange.value, active.value) : null));
const darts = computed(() => (active.value ? positionedDarts(inRange.value, { playerId: active.value }) : []));
const density = computed(() => densityGrid(darts.value.map((dart) => dart.pos), 4, 180, 9));
const spread = computed(() => estimateSpread(darts.value));

/** The busiest sector, which is what the player was going at. */
const busiestSector = computed(() => {
  const counts = new Map<number, number>();
  for (const dart of darts.value) {
    if (dart.atFinish) continue;
    const sector = sectorAtAngle((Math.atan2(dart.pos.y, dart.pos.x) * 180) / Math.PI);
    counts.set(sector, (counts.get(sector) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 20;
});

const split = computed(() => sectorSplit(darts.value.filter((dart) => !dart.atFinish), busiestSector.value));

const aim = computed(() => {
  if (!spread.value || darts.value.length < AIM_MAP_MINIMUM) return null;
  // One symmetric spread rather than pretending to know how the group's own
  // axes line up with the board's.
  const sigma = Math.sqrt(Math.max(spread.value.along, 1) * Math.max(spread.value.across, 1));
  // 2 mm: on a 4 mm grid the treble 20 and 19 are a rounding apart, and a tight thrower was sent to the 19.
  return expectedScoreMap(sigma, sigma, 2);
});

const ranked = computed(() =>
  career.value ? [...career.value.doubles].filter((entry) => entry.attempts >= 5) : [],
);
const bestDouble = computed(() => [...ranked.value].sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0]);
const worstDouble = computed(() => [...ranked.value].sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0))[0]);

const doubleName = (target: number) => (target === 25 ? t.stats.bull : `D${target}`);
const tapped = computed(() => darts.value.filter((dart) => dart.source === 'manual').length);
const aimTarget = computed(() => (aim.value ? scoreAt(aim.value.best.point) : null));
const t20Point = targetPoint(makeHit(20, 'treble'));
// Within a bed's width of the treble 20 is the treble 20.
const aimIsTrebleTwenty = computed(
  () => aim.value !== null && Math.hypot(aim.value.best.point.x - t20Point.x, aim.value.best.point.y - t20Point.y) < 15,
);
const aimPeak = computed(() => (aim.value ? Math.max(...aim.value.values) : 0));
const aimMarkers = computed(() =>
  aim.value && aimTarget.value
    ? [
        { point: aim.value.best.point, label: formatHit(aimTarget.value), kind: 'best' as const },
        ...(aimIsTrebleTwenty.value ? [] : [{ point: t20Point, label: 'T20', kind: 'plain' as const }]),
      ]
    : [],
);
const ramp = `linear-gradient(90deg, ${rampStops()})`;
const aimRamp = `linear-gradient(90deg, ${rampStops('full')})`;
const aimLow = computed(() => (aim.value ? boardMin(aim.value) : 0));
const doubleBars = computed(() =>
  (career.value?.doubles ?? []).slice(0, 10).map((entry) => ({
    key: String(entry.target),
    label: doubleName(entry.target),
    percent: entry.percent,
    hits: entry.hits,
    darts: entry.attempts,
  })),
);
</script>

<template>
  <ScreenShell v-if="people.length === 0 || !career" name="stats" :title="t.stats.title" :lead="t.stats.empty" :back-label="t.stats.back" />

  <ScreenShell
    v-else
    name="stats"
    :title="t.stats.title"
    :lead="lead"
    :back-label="t.stats.back"
  >
    <template #head>
      <div class="stats-filters">
        <Segmented v-model="active" :options="peopleOptions" :label="t.stats.player" />
        <Segmented v-model="range" :options="rangeOptions" :label="t.stats.period" />
        <Segmented v-if="gameOptions.length > 1" v-model="game" :options="gameOptions" :label="t.stats.game" />
      </div>
    </template>

    <ModeStats v-if="otherGame" :stats="otherGame" />
    <p v-else-if="career.dartsThrown === 0" class="empty-note">{{ t.stats.nothingInRange }}</p>
    <template v-else>
      <!-- The four that matter, big; the records in a line under them. -->
      <section class="stats-scoring" :aria-label="t.stats.scoring">
        <h2 class="visually-hidden">{{ t.stats.scoring }}</h2>
        <div class="tiles">
          <StatTile
            :label="t.stats.average"
            :value="number(career.average)"
            :note="fill(t.stats.fromDarts, { n: career.dartsThrown })"
            :title="t.stats.averageNote"
          />
          <StatTile
            :label="t.stats.first9"
            :value="number(career.first9Average)"
            :note="fill(t.stats.fromLegs, { n: career.legs })"
            :title="t.stats.first9Note"
          />
          <StatTile
            :label="t.stats.checkout"
            :value="career.checkoutPercent === null ? '—' : `${number(career.checkoutPercent, 0)}%`"
            :note="fill(t.stats.ofAttempts, { hits: career.checkoutHits, n: career.checkoutAttempts })"
            :title="t.stats.checkoutNote"
          />
          <StatTile
            :label="t.stats.dartsPerLeg"
            :value="career.dartsPerLegWon === null ? '—' : number(career.dartsPerLegWon)"
            :note="fill(t.stats.legsWon, { n: career.legsWon })"
            :title="t.stats.dartsPerLegNote"
          />
        </div>

        <div class="tiles tiles-small">
          <StatTile small :label="t.stats.bestLeg" :value="career.bestLegDarts === null ? '—' : `${career.bestLegDarts}`" />
          <StatTile small :label="t.stats.highestOut" :value="career.highestCheckout === 0 ? '—' : `${career.highestCheckout}`" />
          <StatTile small label="180s" :value="`${career.oneEighties}`" />
          <StatTile small :label="t.stats.tons" :value="`${career.tons}`" />
          <StatTile small :label="t.stats.bestVisit" :value="`${career.bestVisit}`" />
          <StatTile small :label="t.stats.busts" :value="`${career.busts}`" />
        </div>
      </section>

      <div class="stats-grid">
        <section class="panel stats-wide">
          <h2>{{ t.stats.trendTitle }}</h2>
          <LegTrend v-if="legPoints.length >= 2" :points="legPoints" :reference="career.average" />
          <p v-else class="hint">{{ t.stats.trendNeedsMore }}</p>
        </section>

        <section class="panel">
          <h2>{{ t.stats.shape }}</h2>
          <BandBars
            :bands="career.bands.map((band) => ({ label: band.label, count: band.count, strong: band.from >= 100 }))"
            :total="career.visits"
          />
        </section>

        <section class="panel">
          <h2>{{ fill(t.stats.goingAt, { sector: split.sector }) }}</h2>
          <BandBars
            v-if="split.total >= 10"
            :bands="[
              { label: `T${split.sector}`, count: split.treble, strong: true },
              { label: `S${split.sector}`, count: split.single },
              { label: `D${split.sector}`, count: split.double },
              { label: `${split.clockwise.sector}`, count: split.clockwise.count },
              { label: `${split.anticlockwise.sector}`, count: split.anticlockwise.count },
              { label: t.stats.offBoard, count: split.off },
            ]"
            :total="split.total"
          />
          <p v-else class="hint">{{ fill(t.stats.aimPending, { have: darts.length, need: 10 }) }}</p>
        </section>

        <!-- Where the darts land, the board on the left, the group and the doubles beside it. -->
        <section class="panel stats-wide stats-board-row">
          <div class="stats-board">
            <h2>{{ t.stats.where }}</h2>
            <template v-if="darts.length > 0">
              <BoardMap :grid="density" :label="t.stats.whereLabel" />
              <div class="legend">
                <span>{{ t.stats.fewer }}</span>
                <span class="legend-ramp" :style="{ background: ramp }" />
                <span>{{ t.stats.more }}</span>
              </div>
            </template>
            <p v-else class="hint">{{ t.stats.whereEmpty }}</p>
          </div>
          <div class="stats-board-side">
            <p v-if="spread" class="stat-sentence">
              {{ fill(t.stats.groupSentence, { along: number(spread.along, 0), across: number(spread.across, 0), n: spread.count }) }}
            </p>
            <h3 class="stats-sub">{{ t.stats.doubles }}</h3>
            <p v-if="career.doubles.length === 0" class="hint">{{ t.stats.noDoubles }}</p>
            <template v-else>
              <p v-if="bestDouble && worstDouble && bestDouble !== worstDouble" class="stat-sentence">
                {{
                  fill(t.stats.doublesSummary, {
                    best: doubleName(bestDouble.target),
                    bestPercent: number(bestDouble.percent ?? 0, 0),
                    worst: doubleName(worstDouble.target),
                    worstPercent: number(worstDouble.percent ?? 0, 0),
                  })
                }}
              </p>
              <PercentBars :bars="doubleBars" />
              <p class="hint">{{ t.stats.doublesNote }}</p>
            </template>
            <p v-if="tapped > 0" class="hint">{{ fill(t.stats.tappedNote, { n: tapped }) }}</p>
          </div>
        </section>

        <!-- Where to aim, the board on the left, what it says beside it. -->
        <section class="panel stats-wide stats-board-row">
          <div class="stats-board">
            <h2>{{ t.stats.aim }}</h2>
            <template v-if="aim && aimTarget">
              <BoardMap :grid="aim" ramp="full" :label="t.stats.aimLabel" :markers="aimMarkers" />
              <div class="legend">
                <span>{{ number(aimLow) }}</span>
                <span class="legend-ramp" :style="{ background: aimRamp }" />
                <span>{{ fill(t.stats.perDart, { max: number(aimPeak) }) }}</span>
              </div>
            </template>
            <p v-else class="hint">{{ fill(t.stats.aimPending, { have: darts.length, need: AIM_MAP_MINIMUM }) }}</p>
          </div>
          <div v-if="aim && aimTarget" class="stats-board-side">
            <p class="stat-sentence">
              {{
                aimIsTrebleTwenty
                  ? fill(t.stats.aimSentenceSame, { expected: number(aim.best.expected), average: number(aim.best.expected * 3) })
                  : fill(t.stats.aimSentenceOther, {
                      target: formatHit(aimTarget),
                      expected: number(aim.best.expected),
                      treble: number(aim.trebleTwenty),
                      gain: number(aim.best.expected - aim.trebleTwenty),
                      perThree: number((aim.best.expected - aim.trebleTwenty) * 3),
                    })
              }}
            </p>
            <p class="hint">{{ t.stats.aimNote }}</p>
          </div>
        </section>
      </div>
    </template>
  </ScreenShell>
</template>
