/**
 * Statistics for the games other than X01 (issue #22). Each game is measured
 * on its own terms, never folded into the X01 averages: a dart at the 3 round
 * the clock is not a scoring dart, and counting it as one would make
 * everyone's average a lie.
 *
 * One walk over a player's own visits (their team's legs) gives what every
 * game needs:
 *  - legs played and won;
 *  - the darts that counted, and what each dart was thrown at (the `target`
 *    the game recorded), so a hit rate per number;
 *  - marks per number, for cricket;
 *  - one result per leg, in the game's own unit: darts to get round the
 *    clock, the final points in the drills, marks per round in cricket,
 *    lives left in Killer.
 */

import type { Point } from '../board/geometry.js';
import { CRICKET_NUMBERS, cricketMarks } from '../game/cricket.js';
import type { ModeSnapshot } from '../game/modes.js';
import { sideOf } from '../game/teams.js';
import type { DartTarget } from '../game/x01.js';

export type ModeName = ModeSnapshot['config']['mode'];

export interface TargetStat {
  target: DartTarget;
  darts: number;
  hits: number;
  /** 0–100, or null before a dart. */
  percent: number | null;
  /** Where each dart at it landed, where that is known, and whether it counted. */
  throws: { pos: Point; hit: boolean }[];
}

export interface LegResult {
  /** When the leg's last dart was thrown. */
  at: number;
  won: boolean;
  /** The leg in the game's own unit (see `RESULT_UNIT`). Null when it has none, as a clock the player never finished. */
  value: number | null;
}

export interface ModeStats {
  mode: ModeName;
  legs: number;
  won: number;
  /** The player's own darts. */
  darts: number;
  /** Of them, the ones that counted for something in the game. */
  counted: number;
  /** counted ÷ darts, 0–100; null before a dart. */
  hitRate: number | null;
  /** By target, in the game's order (1 to 20, then the bull, then any double and any treble). */
  targets: TargetStat[];
  /** Cricket: marks per number (25 the bull). */
  marks: Record<number, number>;
  /** Cricket: darts in a treble of 15 to 20. */
  trebles: number;
  /** Points scored by the player's own darts. */
  points: number;
  /** The best visit of the player's own, in points. */
  bestVisit: number;
  results: LegResult[];
}

/** What a leg's result is, game by game, and whether more is better. */
export const RESULT_UNIT: Record<ModeName, { unit: 'darts' | 'points' | 'mpr' | 'lives'; higherIsBetter: boolean }> = {
  aroundTheClock: { unit: 'darts', higherIsBetter: false },
  cricket: { unit: 'mpr', higherIsBetter: true },
  shanghai: { unit: 'points', higherIsBetter: true },
  killer: { unit: 'lives', higherIsBetter: true },
  bobs27: { unit: 'points', higherIsBetter: true },
  halveIt: { unit: 'points', higherIsBetter: true },
  countUp: { unit: 'points', higherIsBetter: true },
};

const targetOrder = (target: DartTarget) => (target === 'double' ? 26 : target === 'treble' ? 27 : target);

export function modeStats(snapshots: readonly ModeSnapshot[], mode: ModeName, playerId: string): ModeStats {
  const stats: ModeStats = {
    mode,
    legs: 0,
    won: 0,
    darts: 0,
    counted: 0,
    hitRate: null,
    targets: [],
    marks: Object.fromEntries(CRICKET_NUMBERS.map((n) => [n, 0])),
    trebles: 0,
    points: 0,
    bestVisit: 0,
    results: [],
  };
  const targets = new Map<DartTarget, TargetStat>();

  for (const snapshot of snapshots) {
    if (snapshot.config.mode !== mode || !snapshot.config.players.some((player) => player.id === playerId)) continue;
    const side = sideOf(snapshot.config, playerId);

    for (const leg of snapshot.legs) {
      const own = leg.visits.filter((visit) => visit.throwerId === playerId);
      let legDarts = 0;
      let legMarks = 0;
      let last = 0;

      for (const visit of own) {
        let visitPoints = 0;
        for (const dart of visit.darts) {
          const counted = (dart.hits ?? 0) > 0;
          legDarts += 1;
          last = Math.max(last, dart.ts);
          stats.darts += 1;
          if (counted) stats.counted += 1;
          stats.points += dart.scored;
          visitPoints += dart.scored;

          if (dart.target !== undefined) {
            const entry = targets.get(dart.target) ?? { target: dart.target, darts: 0, hits: 0, percent: null, throws: [] };
            entry.darts += 1;
            if (counted) entry.hits += 1;
            if (dart.pos) entry.throws.push({ pos: dart.pos, hit: counted });
            targets.set(dart.target, entry);
          }
          if (mode === 'cricket') {
            const on = cricketMarks(dart.hit);
            if (on) {
              stats.marks[on.number] = (stats.marks[on.number] ?? 0) + on.marks;
              legMarks += on.marks;
              if (dart.hit.ring === 'treble') stats.trebles += 1;
            }
          }
        }
        stats.bestVisit = Math.max(stats.bestVisit, visitPoints);
      }

      // A leg counts once it is decided; one still being played has no result yet.
      if (!leg.over) continue;
      const won = leg.winnerId === side;
      stats.legs += 1;
      if (won) stats.won += 1;
      stats.results.push({ at: last, won, value: legResult(mode, leg, side, legDarts, legMarks, won) });
    }
  }

  stats.hitRate = stats.darts === 0 ? null : (stats.counted / stats.darts) * 100;
  stats.targets = [...targets.values()]
    .map((entry) => ({ ...entry, percent: entry.darts === 0 ? null : (entry.hits / entry.darts) * 100 }))
    .sort((a, b) => targetOrder(a.target) - targetOrder(b.target));
  stats.results.sort((a, b) => a.at - b.at);
  return stats;
}

function legResult(mode: ModeName, leg: ModeSnapshot['legs'][number], side: string, darts: number, marks: number, won: boolean): number | null {
  switch (RESULT_UNIT[mode].unit) {
    // Round the clock, a leg is the darts it took to get round: the side's, so a team's is the team's.
    case 'darts':
      return won ? (leg.dartsThrown[side] ?? 0) : null;
    case 'mpr':
      return darts === 0 ? null : (marks / darts) * 3;
    default:
      return leg.remaining[side] ?? null;
  }
}

/** The best and the average of the legs' results, the best by the game's own measure. */
export function resultSummary(stats: ModeStats): { best: number | null; average: number | null } {
  const values = stats.results.flatMap((result) => (result.value === null ? [] : [result.value]));
  if (values.length === 0) return { best: null, average: null };
  const higher = RESULT_UNIT[stats.mode].higherIsBetter;
  return {
    best: higher ? Math.max(...values) : Math.min(...values),
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}
