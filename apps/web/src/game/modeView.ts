/**
 * What the screens show of a game other than X01 (issue #22): its name and
 * settings in words, each player's card, the heading, a visit's total in the
 * visit sheet, and the numbers at the end. Plain functions of the snapshot,
 * so the game screen stays a layout and this stays testable.
 */

import {
  CRICKET_NUMBERS,
  HALVE_IT_TARGETS,
  bobs27Rounds,
  bobs27Target,
  clockAim,
  clockProgress,
  clockSequence,
  formatHit,
  halveItTarget,
  isKiller,
  isX01,
  legsToWin,
  modeOf,
  shanghaiTarget,
  visitsDone,
  type GameConfig,
  type HalveTarget,
  type ModeSnapshot,
  type CricketState,
  type Visit,
} from '@treblewise/core';

import { fill, strings } from '../i18n/index.js';

/** A row of numbers side by side: HeadToHead.vue's row. */
export interface HeadToHeadRow {
  label: string;
  values: (number | null)[];
  texts: string[];
  higherIsBetter?: boolean | null;
}

type ModeLeg = ModeSnapshot['legs'][number];

/** "Cricket", "Around the clock", or "501" for X01. */
export function gameName(config: GameConfig): string {
  return isX01(config) ? String(config.startScore) : strings().modes.names[modeOf(config)];
}

/** The game and its settings in a line: "Cricket · cut-throat · first to 3 legs". */
export function gameSummary(config: GameConfig): string {
  const t = strings();
  const s = t.modes.summary;
  if (isX01(config)) {
    return t.setup.summary(config.startScore, config.inRule, config.outRule, config.legsPerSet, config.setsToWin);
  }
  const legs = [s.legs(config.legsToWin)];
  const parts: string[] = [t.modes.names[config.mode]];
  switch (config.mode) {
    case 'cricket':
      parts.push(s.cricket[config.scoring], ...legs);
      break;
    case 'aroundTheClock':
      parts.push(
        t.modes.clock.orders[config.order],
        s.clockRing[config.ring],
        ...(config.hitsPerTarget > 1 ? [s.hits(config.hitsPerTarget)] : []),
        ...(config.multiples && config.ring === 'any' ? [s.multiples] : []),
        ...(config.bull ? [s.bull] : []),
        ...legs,
      );
      break;
    case 'shanghai':
      parts.push(s.rounds(config.rounds), ...(config.shanghaiWins ? [s.shanghaiWins] : []), ...legs);
      break;
    case 'killer':
      parts.push(s.lives(config.lives), s.killerRing[config.ring], s.numbers[config.numbers], ...legs);
      break;
    case 'bobs27':
      parts.push(...(config.bull ? [s.bobsBull] : []), ...(config.playOn ? [s.playOn] : []));
      break;
    case 'halveIt':
      parts.push(t.modes.halveIt.presets[config.preset]);
      break;
    case 'countUp':
      parts.push(s.rounds(config.rounds));
      break;
  }
  return parts.join(' · ');
}

/** A Halve-it target in words: "17", "any double", "Bull". */
export function halveTargetText(target: HalveTarget): string {
  const p = strings().modes.play;
  if (target === 'double') return p.anyDouble;
  if (target === 'treble') return p.anyTreble;
  if (target === 'bull') return p.bull;
  return String(target);
}

/** The short form of the Halve-it targets, for the setup: "15 16 D 17 18 T 19 20 Bull". */
export function halveTargetsShort(preset: keyof typeof HALVE_IT_TARGETS): string {
  return HALVE_IT_TARGETS[preset].map((target) => (target === 'double' ? 'D' : target === 'treble' ? 'T' : target === 'bull' ? strings().modes.play.bull : String(target))).join(' ');
}

/** A number as a target: "7", or "Bull" for 25. */
const numberText = (n: number) => (n === 25 ? strings().modes.play.bull : String(n));

/** What the player is aiming at now, in words, or null when there is no one target. */
export function targetText(snapshot: ModeSnapshot, playerId: string, leg: ModeLeg | null): string | null {
  const config = snapshot.config;
  const round = leg ? visitsDone(leg, playerId) + 1 : 1;
  switch (config.mode) {
    case 'aroundTheClock': {
      const state = leg?.state.kind === 'aroundTheClock' ? leg.state : null;
      const sequence = clockSequence(config);
      const at = clockProgress(config, state?.hits[playerId] ?? 0).index;
      const n = sequence[at];
      if (n === undefined) return null;
      return config.ring === 'any' ? numberText(n) : formatHit(clockAim(config, n));
    }
    case 'shanghai':
      return numberText(shanghaiTarget(config, round));
    case 'bobs27': {
      const n = bobs27Target(round);
      return n === 25 ? strings().modes.play.bull : `D${n}`;
    }
    case 'halveIt':
      return halveTargetText(halveItTarget(config, round));
    case 'killer': {
      const state = leg?.state.kind === 'killer' ? leg.state : null;
      const own = state?.number[playerId];
      if (own == null || !state || isKiller(config, state, playerId)) return null;
      return config.ring === 'double' ? `D${own}` : String(own);
    }
    default:
      return null;
  }
}

/** What the screen asks of the player at the oche: "Ann, aim at D7", "Bob, throw for your number". */
export function modeHeading(snapshot: ModeSnapshot): string {
  const current = snapshot.current;
  if (!current) return '';
  const t = strings();
  const name = snapshot.config.players.find((p) => p.id === current.playerId)?.name ?? '';
  const leg = currentLeg(snapshot);
  if (snapshot.config.mode === 'killer' && leg?.state.kind === 'killer' && leg.state.number[current.playerId] === null) {
    return fill(t.modes.play.pickNumber, { name });
  }
  const target = targetText(snapshot, current.playerId, leg);
  return target ? fill(t.modes.play.aimAt, { name, target }) : fill(t.game.toThrowName, { name });
}

/** The leg being played, or null between legs (the last one is over). */
export function currentLeg(snapshot: ModeSnapshot): ModeLeg | null {
  const leg = snapshot.legs.at(-1) ?? null;
  return leg && !leg.over ? leg : null;
}

export interface ModeCard {
  id: string;
  name: string;
  /** The big number, or the target. */
  value: string;
  /** What the value is: "Points", "Target". */
  label: string;
  /** A line under it: the round, the progress. */
  caption: string;
  current: boolean;
  starts: boolean;
  out: boolean;
  legsWon: number;
  /** A tag beside the name: "Killer". */
  badge: string | null;
  /** Lives, as pips: so many on of so many. */
  pips: { on: number; of: number } | null;
  /** Progress through the game, 0 to 1. */
  progress: number | null;
}

/**
 * Each player's card. `holder` is the player still holding the board with
 * their darts in it (the camera's pull-out), who stays lit until they are out.
 */
export function modeCards(snapshot: ModeSnapshot, holder: string | null = null): ModeCard[] {
  const t = strings();
  const p = t.modes.play;
  const config = snapshot.config;
  const last = snapshot.legs.at(-1) ?? null;
  // Between legs, the cards show the next leg as it starts; once the game is
  // over, they keep where it ended.
  const leg = last && (!last.over || snapshot.current === null) ? last : null;

  return config.players.map((player) => {
    const id = player.id;
    const isCurrent = holder ? holder === id : snapshot.current?.playerId === id;
    const base: ModeCard = {
      id,
      name: player.name,
      value: '0',
      label: p.points,
      caption: '',
      current: isCurrent,
      starts: leg ? leg.startingPlayerId === id : false,
      out: false,
      legsWon: snapshot.legsWon[id] ?? 0,
      badge: null,
      pips: null,
      progress: null,
    };
    const round = leg ? visitsDone(leg, id) + 1 : 1;
    const score = leg ? (leg.remaining[id] ?? 0) : null;

    switch (config.mode) {
      case 'cricket':
        return { ...base, value: String(score ?? 0) };
      case 'aroundTheClock': {
        const hits = leg?.state.kind === 'aroundTheClock' ? (leg.state.hits[id] ?? 0) : 0;
        const total = clockSequence(config).length;
        const at = clockProgress(config, hits);
        const done = at.index >= total;
        return {
          ...base,
          value: done ? p.done : (targetText(snapshot, id, leg) ?? ''),
          label: p.target,
          caption: [fill(p.ofTargets, { n: at.index, of: total }), ...(config.hitsPerTarget > 1 && !done ? [fill(p.onTarget, { n: at.onTarget, of: config.hitsPerTarget })] : [])].join(' · '),
          progress: at.index / total,
        };
      }
      case 'shanghai': {
        const rounds = Math.min(20, config.rounds);
        return {
          ...base,
          value: String(score ?? 0),
          caption: round > rounds ? p.tiebreak : fill(p.round, { n: Math.min(round, rounds), of: rounds }),
          progress: Math.min(1, (round - 1) / rounds),
        };
      }
      case 'killer': {
        const state = leg?.state.kind === 'killer' ? leg.state : null;
        const own = state?.number[id] ?? (config.numbers === 'drawn' ? (config.assigned?.[id] ?? null) : null);
        const lives = state?.lives[id] ?? config.lives;
        const killer = state ? isKiller(config, state, id) : false;
        const charge = state?.charge[id] ?? 0;
        return {
          ...base,
          value: own === null ? '?' : String(own),
          label: p.number,
          caption: lives === 0 ? p.out : own === null ? p.noNumber : killer ? '' : fill(p.charging, { n: charge, of: config.hitsToKill }),
          out: lives === 0,
          badge: killer && lives > 0 ? p.killer : null,
          pips: { on: lives, of: config.lives },
        };
      }
      case 'bobs27': {
        const out = leg?.state.kind === 'bobs27' ? leg.state.out[id] === true : false;
        const rounds = bobs27Rounds(config);
        const finished = round > rounds;
        return {
          ...base,
          value: String(score ?? 27),
          label: p.score,
          caption: out ? p.out : finished ? p.done : `${fill(p.round, { n: round, of: rounds })} · ${targetText(snapshot, id, leg)}`,
          out,
          progress: Math.min(1, (round - 1) / rounds),
        };
      }
      case 'halveIt': {
        const rounds = HALVE_IT_TARGETS[config.preset].length;
        return {
          ...base,
          value: String(score ?? 0),
          label: p.score,
          caption: round > rounds ? p.done : `${fill(p.round, { n: round, of: rounds })} · ${targetText(snapshot, id, leg)}`,
          progress: Math.min(1, (round - 1) / rounds),
        };
      }
      case 'countUp': {
        const darts = leg?.dartsThrown[id] ?? 0;
        const average = darts > 0 ? ((score ?? 0) / darts) * 3 : null;
        return {
          ...base,
          value: String(score ?? 0),
          caption: [
            round > config.rounds ? p.done : fill(p.round, { n: round, of: config.rounds }),
            ...(average === null ? [] : [fill(p.average, { n: average.toFixed(1) })]),
          ].join(' · '),
          progress: Math.min(1, (round - 1) / config.rounds),
        };
      }
    }
  });
}

/** A visit's line in the visit sheet: what it did, and where it left the player. */
export function visitLine(snapshot: ModeSnapshot, visit: Visit): { total: string; left: string } {
  const p = strings().modes.play;
  const hits = visit.darts.reduce((sum, dart) => sum + (dart.hits ?? 0), 0);
  const points = visit.darts.reduce((sum, dart) => sum + dart.scored, 0);
  const config = snapshot.config;
  switch (config.mode) {
    case 'cricket':
      return {
        total: hits === 0 ? p.noHit : p.marks(hits),
        left: config.scoring === 'noScore' ? '' : fill(p.pointsLeft, { n: visit.scoreAfter }),
      };
    case 'aroundTheClock':
      return { total: hits === 0 ? p.noHit : p.hits(hits), left: '' };
    case 'killer': {
      const picking = visit.darts.length === 1 && visit.darts[0]!.hits === 0 && visit.scoreBefore === visit.scoreAfter;
      return { total: hits === 0 ? (picking ? '' : p.noHit) : p.hits(hits), left: fill(p.livesLeft, { n: visit.scoreAfter }) };
    }
    case 'bobs27':
      return {
        total: fill(visit.busted ? p.took : p.added, { n: Math.abs(visit.scoreAfter - visit.scoreBefore) }),
        left: fill(p.totalLeft, { n: visit.scoreAfter }),
      };
    case 'halveIt':
      return { total: visit.busted ? p.halved : fill(p.equals, { n: points }), left: fill(p.totalLeft, { n: visit.scoreAfter }) };
    default:
      return { total: fill(p.equals, { n: points }), left: fill(p.totalLeft, { n: visit.scoreAfter }) };
  }
}

/** The title bar: "Cricket · First to 3 legs · 1–0", or the game's name alone for one game. */
export function modeTitle(snapshot: ModeSnapshot): string {
  const t = strings();
  const config = snapshot.config;
  const name = t.modes.names[config.mode];
  const legs = legsToWin(config);
  if (legs <= 1) return name;
  const target = fill(t.game.firstToLegs, { n: legs });
  const score = config.players.map((p) => snapshot.legsWon[p.id] ?? 0).join('–');
  return `${name} · ${target} · ${score}`;
}

/** How a leg was won, in words: "Ann closed everything". */
export function legHow(snapshot: ModeSnapshot, leg: ModeLeg): string {
  const p = strings().modes.play;
  const name = snapshot.config.players.find((pl) => pl.id === leg.winnerId)?.name ?? '';
  if (!leg.winnerId) return '';
  switch (leg.state.kind) {
    case 'cricket':
      return fill(p.closedAll, { name });
    case 'aroundTheClock':
      return fill(p.roundAll, { name });
    case 'killer':
      return fill(p.lastStanding, { name });
    case 'shanghai':
      return leg.state.shanghai ? fill(p.shanghaiShot, { name }) : fill(p.winsWith, { name, n: leg.remaining[leg.winnerId] ?? 0 });
    default:
      return fill(p.winsWith, { name, n: leg.remaining[leg.winnerId] ?? 0 });
  }
}

/** The numbers side by side for the legs given (one leg, or all of them). */
export function modeRows(snapshot: ModeSnapshot, legs: readonly ModeLeg[]): HeadToHeadRow[] {
  const p = strings().modes.play.rows;
  const ids = snapshot.config.players.map((pl) => pl.id);
  const darts = (id: string) => legs.flatMap((l) => l.visits).filter((v) => v.playerId === id).flatMap((v) => v.darts);
  const visits = (id: string) => legs.flatMap((l) => l.visits).filter((v) => v.playerId === id && v.darts.length > 0);
  const hits = (id: string) => darts(id).reduce((sum, d) => sum + (d.hits ?? 0), 0);
  const hitDarts = (id: string) => darts(id).filter((d) => (d.hits ?? 0) > 0).length;
  const last = legs.at(-1);
  const score = (id: string) => last?.remaining[id] ?? 0;
  const pct = (id: string) => {
    const n = darts(id).length;
    return n === 0 ? null : (hitDarts(id) / n) * 100;
  };
  const row = (label: string, values: (number | null)[], text: (v: number | null) => string, higherIsBetter: boolean | null = true): HeadToHeadRow => ({
    label,
    values,
    texts: values.map(text),
    higherIsBetter,
  });
  const whole = (v: number | null) => (v === null ? '–' : String(v));
  const one = (v: number | null) => (v === null ? '–' : v.toFixed(1));
  const percent = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`);
  const dartsRow = row(p.darts, ids.map((id) => darts(id).length), whole, null);

  switch (snapshot.config.mode) {
    case 'cricket': {
      const mpr = (id: string) => {
        const n = darts(id).length;
        return n === 0 ? null : (hits(id) / n) * 3;
      };
      return [
        ...(snapshot.config.scoring === 'noScore' ? [] : [row(p.points, ids.map(score), whole, snapshot.config.scoring === 'standard')]),
        row(p.marks, ids.map(hits), whole),
        row(p.mpr, ids.map(mpr), one),
        dartsRow,
      ];
    }
    case 'aroundTheClock': {
      const config = snapshot.config;
      const done = (id: string) => {
        const state = last?.state.kind === 'aroundTheClock' ? last.state : null;
        return clockProgress(config, state?.hits[id] ?? 0).index;
      };
      return [row(p.targets, ids.map(done), whole), row(p.hitRate, ids.map(pct), percent), dartsRow];
    }
    case 'killer':
      return [row(p.lives, ids.map(score), whole), row(p.hitRate, ids.map(pct), percent), dartsRow];
    case 'shanghai':
      return [row(p.points, ids.map(score), whole), row(p.hitRate, ids.map(pct), percent), dartsRow];
    case 'bobs27':
      return [row(p.score, ids.map(score), whole), row(p.doubles, ids.map(hitDarts), whole), row(p.hitRate, ids.map(pct), percent)];
    case 'halveIt':
      return [
        row(p.score, ids.map(score), whole),
        row(p.halved, ids.map((id) => visits(id).filter((v) => v.busted).length), whole, false),
        row(p.hitRate, ids.map(pct), percent),
      ];
    case 'countUp': {
      const average = (id: string) => {
        const n = darts(id).length;
        return n === 0 ? null : (darts(id).reduce((sum, d) => sum + d.scored, 0) / n) * 3;
      };
      const best = (id: string) => Math.max(0, ...visits(id).map((v) => v.darts.reduce((sum, d) => sum + d.scored, 0)));
      return [row(p.score, ids.map(score), whole), row(p.average, ids.map(average), one), row(p.highestVisit, ids.map(best), whole)];
    }
  }
}

/** The cricket board's rows: each number, and each player's marks on it (3 is closed). */
export function cricketRows(state: CricketState | null, ids: readonly string[]) {
  return CRICKET_NUMBERS.map((n) => ({
    n,
    label: numberText(n),
    marks: ids.map((id) => Math.min(3, state?.marks[id]?.[n] ?? 0)),
    closedByAll: ids.every((id) => (state?.marks[id]?.[n] ?? 0) >= 3),
  }));
}
