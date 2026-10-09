<!--
  The statistics page.

  Two halves, as docs/04-stats.md sets out. The classical numbers work from
  scores alone, so they are there from the first leg. The positional ones need
  to know where each dart landed: heatmap, grouping, and the aiming map that is
  the reason this project stores coordinates at all.

  Every number carries its sample size, and every contested definition says
  what it means next to itself rather than in a help page nobody opens.
-->
<script setup lang="ts">
import {
  careerStats,
  densityGrid,
  estimateSpread,
  expectedScoreMap,
  formatHit,
  hit as makeHit,
  positionedDarts,
  reduceMatch,
  scoreAt,
  sectorAtAngle,
  sectorSplit,
  targetPoint,
  type MatchSnapshot,
} from '@treblewise/core';
import { computed, onMounted, ref } from 'vue';

import BandBars from '../components/charts/BandBars.vue';
import BoardMap from '../components/charts/BoardMap.vue';
import { rampStops } from '../components/charts/heatRamp.js';
import StatTile from '../components/charts/StatTile.vue';
import TrendChart from '../components/charts/TrendChart.vue';
import ScreenShell from '../components/ui/ScreenShell.vue';
import Segmented from '../components/ui/Segmented.vue';
import { fill, useStrings } from '../i18n/index.js';
import { useMatchesStore, usePlayersStore } from '../store/stores.js';

type Range = 'session' | 'month' | 'all';

/** Darts needed before the spread is worth estimating, per the paper: ~50. */
const AIM_MAP_MINIMUM = 50;

function lastDartAt(snapshot: MatchSnapshot): number {
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

const snapshots = computed(() => matches.history.map((match) => reduceMatch(match.config, match.events)));

const people = computed(() => {
  const seen = new Map<string, { id: string; name: string; darts: number }>();
  for (const snapshot of snapshots.value) {
    for (const player of snapshot.config.players) {
      // Guests are scored like anyone else and then forgotten: they are here
      // to play, not to be measured, and they would fill this list up.
      if (player.temporary) continue;
      // The profile's current name wins over the one stored with the match:
      // a rename is meant to be visible everywhere, not only from now on.
      const name = players.profiles.find((profile) => profile.id === player.id)?.name ?? player.name;
      const entry = seen.get(player.id) ?? { id: player.id, name, darts: 0 };
      entry.name = name;
      entry.darts += snapshot.legs.reduce((sum, leg) => sum + (leg.dartsThrown[player.id] ?? 0), 0);
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

const inRange = computed(() => {
  if (range.value === 'all') return snapshots.value;
  const now = Date.now();
  const cutoff = range.value === 'month' ? now - 30 * 24 * 3600_000 : now - 12 * 3600_000;
  return snapshots.value.filter((snapshot) => lastDartAt(snapshot) >= cutoff);
});

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
  return expectedScoreMap(sigma, sigma, 4);
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
</script>

<template>
  <ScreenShell v-if="people.length === 0 || !career" name="stats" :title="t.stats.title" :lead="t.stats.empty" :back-label="t.stats.back" />

  <ScreenShell
    v-else
    name="stats"
    :title="t.stats.title"
    :lead="fill(t.stats.subtitle, { matches: career.matches, darts: career.dartsThrown })"
    :back-label="t.stats.back"
  >
    <Segmented v-model="active" :options="peopleOptions" :label="t.stats.player" />
    <Segmented v-model="range" :options="rangeOptions" :label="t.stats.period" />

    <p v-if="career.dartsThrown === 0" class="hint">{{ t.stats.nothingInRange }}</p>
    <template v-else>
      <section class="panel">
        <h2>{{ t.stats.scoring }}</h2>
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

        <div class="tiles">
          <StatTile small :label="t.stats.bestLeg" :value="career.bestLegDarts === null ? '—' : `${career.bestLegDarts}`" />
          <StatTile small :label="t.stats.highestOut" :value="career.highestCheckout === 0 ? '—' : `${career.highestCheckout}`" />
          <StatTile small label="180s" :value="`${career.oneEighties}`" />
          <StatTile small :label="t.stats.tons" :value="`${career.tons}`" />
          <StatTile small :label="t.stats.bestVisit" :value="`${career.bestVisit}`" />
          <StatTile small :label="t.stats.busts" :value="`${career.busts}`" />
        </div>
      </section>

      <section v-if="career.sessions.length >= 2" class="panel">
        <h2>{{ t.stats.form }}</h2>
        <TrendChart
          :points="career.sessions.map((session) => ({ label: session.day.slice(5), value: session.average }))"
          :reference="{ value: career.average, label: t.stats.careerAverage }"
        />
        <p class="hint">{{ fill(t.stats.formNote, { n: career.sessions.length }) }}</p>
      </section>

      <section class="panel">
        <h2>{{ t.stats.shape }}</h2>
        <BandBars
          :bands="career.bands.map((band) => ({ label: band.label, count: band.count, strong: band.from >= 100 }))"
          :total="career.visits"
        />
      </section>

      <section class="panel">
        <h2>{{ t.stats.doubles }}</h2>
        <p v-if="career.doubles.length === 0" class="hint">{{ t.stats.noDoubles }}</p>
        <template v-else>
          <p v-if="bestDouble && worstDouble && bestDouble !== worstDouble" class="hint">
            {{
              fill(t.stats.doublesSummary, {
                best: doubleName(bestDouble.target),
                bestPercent: number(bestDouble.percent ?? 0, 0),
                worst: doubleName(worstDouble.target),
                worstPercent: number(worstDouble.percent ?? 0, 0),
              })
            }}
          </p>
          <ul class="bars">
            <li v-for="entry in career.doubles.slice(0, 10)" :key="entry.target">
              <span class="bars-label">{{ doubleName(entry.target) }}</span>
              <span class="bars-track">
                <span class="bars-fill" :style="{ width: `${entry.percent ?? 0}%` }" />
              </span>
              <span class="bars-value">
                {{ entry.percent === null ? '—' : `${number(entry.percent, 0)}%` }}
                <small>{{ entry.hits }}/{{ entry.attempts }}</small>
              </span>
            </li>
          </ul>
          <p class="hint">{{ t.stats.doublesNote }}</p>
        </template>
      </section>

      <section v-if="darts.length > 0" class="panel">
        <h2>{{ t.stats.where }}</h2>
        <BoardMap :grid="density" :label="t.stats.whereLabel" />
        <div class="legend">
          <span>{{ t.stats.fewer }}</span>
          <span class="legend-ramp" :style="{ background: ramp }" />
          <span>{{ t.stats.more }}</span>
        </div>

        <p v-if="spread" class="stat-sentence">
          {{ fill(t.stats.groupSentence, { along: number(spread.along, 0), across: number(spread.across, 0), n: spread.count }) }}
        </p>

        <template v-if="split.total >= 10">
          <h2>{{ fill(t.stats.goingAt, { sector: split.sector }) }}</h2>
          <BandBars
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
        </template>

        <p v-if="tapped > 0" class="hint">{{ fill(t.stats.tappedNote, { n: tapped }) }}</p>
      </section>

      <section class="panel">
        <h2>{{ t.stats.aim }}</h2>
        <template v-if="aim && aimTarget">
          <BoardMap :grid="aim" :floor="0.02" :label="t.stats.aimLabel" :markers="aimMarkers" />
          <div class="legend">
            <span>0</span>
            <span class="legend-ramp" :style="{ background: ramp }" />
            <span>{{ fill(t.stats.perDart, { max: number(aimPeak) }) }}</span>
          </div>
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
        </template>
        <p v-else class="hint">{{ fill(t.stats.aimPending, { have: darts.length, need: AIM_MAP_MINIMUM }) }}</p>
      </section>
    </template>
  </ScreenShell>
</template>
