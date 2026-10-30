/**
 * Finding the board in a photograph by itself.
 *
 * A standard board's red and green beds are the most colourful thing in the
 * picture, at sizes and in a pattern known to the millimetre. `locate` finds
 * them roughly from nothing, `refine` snaps that onto the wires, and the four
 * calibration landmarks are then simply where the fit puts them. See
 * docs/design/auto-calibration.md.
 */

import { CALIBRATION_BOARD_POINTS } from '../calibration.js';
import { applyHomography, type Matrix3 } from '../homography.js';
import type { Point } from '../../board/geometry.js';
import { boardMaps, locate, type LocateStep } from './locate.js';
import { refine } from './refine.js';
import type { RgbaImage } from './raster/masks.js';

export type { RgbaImage } from './raster/masks.js';

export type FinderStep = 'colours' | LocateStep | 'wires';

/** The steps in the order they run, for a loading screen. */
export const FINDER_STEPS: readonly FinderStep[] = ['colours', 'bull', 'ring', 'tilt', 'turn', 'wires'];

export interface BoardFit {
  readonly ringFeatures: number;
  readonly wireFeatures: number;
  /** Residuals of every measurement, board millimetres. */
  readonly medianMm: number;
  readonly p90Mm: number;
  /** The sector fitting clearly worse than the rest, where a person should look; null when none does. */
  readonly worstSector: number | null;
}

export interface FoundBoard {
  /** Board millimetres → image pixels, fitted on every ring edge and wire found. */
  readonly toImage: Matrix3;
  /** CALIBRATION_LANDMARKS projected through toImage, in landmark order. */
  readonly imagePoints: Point[];
  readonly fit: BoardFit;
}

export type BoardNotFound = 'noBull' | 'noRing' | 'weakFit';

/** Fewer measurements than this and a fit is a guess, not a calibration. */
const ENOUGH = { ring: 80, wire: 30 };

/**
 * A sector is worth pointing at when the measurements agreeing with the fit
 * there sit this far off their wires, and this many times the board's median.
 * On the user's real photos a good fit's worst sector comes to at most 2.6
 * times the median, so this does not cry wolf.
 */
const WORST = { mm: 2, times: 3 };

export function findBoard(
  image: RgbaImage,
  options: {
    /** Start from here (the current markers, or the calibration in use) instead of searching the picture. */
    near?: Matrix3;
    /** Called as each step starts. */
    onStep?: (step: FinderStep) => void;
  } = {},
): FoundBoard | { notFound: BoardNotFound } {
  const onStep = options.onStep ?? (() => {});
  onStep('colours');
  const maps = boardMaps(image);
  let start = options.near;
  if (!start) {
    const located = locate(maps, onStep);
    if ('notFound' in located) return located;
    start = located.toImage;
  }
  onStep('wires');
  const refined = refine(maps, start);
  if (!refined || refined.ringFeatures < ENOUGH.ring || refined.wireFeatures < ENOUGH.wire) return { notFound: 'weakFit' };

  let worstSector: number | null = null;
  let worst = WORST.mm;
  refined.sectorMedianMm.forEach((mm, sector) => {
    if (mm >= worst && mm >= WORST.times * refined.medianMm) {
      worst = mm;
      worstSector = sector;
    }
  });

  return {
    toImage: refined.toImage,
    imagePoints: CALIBRATION_BOARD_POINTS.map((p) => applyHomography(refined.toImage, p)),
    fit: {
      ringFeatures: refined.ringFeatures,
      wireFeatures: refined.wireFeatures,
      medianMm: refined.medianMm,
      p90Mm: refined.p90Mm,
      worstSector,
    },
  };
}
