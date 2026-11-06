/**
 * What the statistics screen shows of a game other than X01 (issue #22):
 * the tiles at the top, in the game's own terms, and how a target is named.
 * Plain functions of core's `modeStats`, so the screen stays a layout.
 */

import { resultSummary, type DartTarget, type ModeName, type ModeStats } from '@treblewise/core';

import { fill, strings } from '../i18n/index.js';

export interface Tile {
  label: string;
  value: string;
  note?: string;
}

const one = (value: number | null, digits = 1) => (value === null ? '—' : value.toFixed(digits));
const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value)}%`);

/** A target as the player knows it: "7", "D7" in Bob's 27, "Bull", "Any double". */
export function targetLabel(target: DartTarget, mode: ModeName): string {
  const s = strings().stats;
  if (target === 'double') return s.anyDouble;
  if (target === 'treble') return s.anyTreble;
  if (target === 25) return s.bull;
  return mode === 'bobs27' ? `D${target}` : String(target);
}

/** The four numbers at the top of a game's statistics. */
export function modeTiles(stats: ModeStats): Tile[] {
  const s = strings().stats;
  const { best, average } = resultSummary(stats);
  const games: Tile = { label: s.games, value: String(stats.legs), note: fill(s.wonNote, { n: stats.won }) };
  const hitRate: Tile = {
    label: s.hitRate,
    value: percent(stats.hitRate),
    note: fill(s.hitRateNote, { hits: stats.counted, darts: stats.darts }),
  };
  const points = (label: string, value: number | null): Tile => ({ label, value: one(value, 0), note: s.pointsNote });

  switch (stats.mode) {
    case 'aroundTheClock':
      return [
        games,
        { label: s.bestRound, value: one(best, 0), note: s.dartsToGoRound },
        { label: s.averageRound, value: one(average), note: s.dartsToGoRound },
        hitRate,
      ];
    case 'cricket': {
      const marks = Object.values(stats.marks).reduce((sum, n) => sum + n, 0);
      return [
        games,
        { label: s.mpr, value: one(stats.darts === 0 ? null : (marks / stats.darts) * 3, 2), note: fill(s.mprNote, { marks }) },
        { label: s.bestMpr, value: one(best, 2), note: s.mpr.toLowerCase() },
        { label: s.trebles, value: String(stats.trebles) },
      ];
    }
    case 'killer':
      return [games, { label: s.hitRate, value: percent(stats.hitRate), note: hitRate.note }];
    case 'countUp':
      return [
        points(s.bestGame, best),
        points(s.averageGame, average),
        { label: s.average3, value: one(stats.darts === 0 ? null : (stats.points / stats.darts) * 3), note: fill(s.fromDarts, { n: stats.darts }) },
        { label: s.bestVisit, value: String(stats.bestVisit) },
      ];
    case 'bobs27':
      return [games, points(s.bestGame, best), points(s.averageGame, average), { ...hitRate, label: s.doublesHit }];
    default:
      return [games, points(s.bestGame, best), points(s.averageGame, average), hitRate];
  }
}
