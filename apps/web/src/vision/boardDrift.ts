/**
 * Following the board: between visits, on a photograph of the empty board,
 * the board is found again, and when it has moved the calibration moves with
 * it.
 *
 * On the user's board the phone slides on its hook a few millimetres in
 * twenty minutes, and pulling darts out nudges the board: measured on their
 * photographs, the found board drifted 1 to 4.6 mm over a session, against a
 * finder that repeats to 0.3–0.6 mm from one photograph to the next. A score
 * read through a calibration 3 mm out is a treble read as a single.
 *
 * The person's calibration is not replaced by the finder's: the motion
 * between the finder's fit then and now is applied to it, so a marker they
 * dragged keeps their correction. Nothing changes while darts are in the
 * board: the photograph is of an empty board, and the new calibration is kept
 * only if the board is still empty when it is ready.
 */

import {
  CALIBRATION_BOARD_POINTS,
  applyHomography,
  boardRegion,
  invertHomography,
  multiply3,
  type FoundBoard,
  type Matrix3,
  type Point,
} from '@treblewise/core';

import { calibrate } from '../storage/frames.js';
import type { Calibration } from '../storage/types.js';
import type { GrabbedFrame, Region } from './camera.js';
import type { FinderResult, FindOptions } from './findBoard.js';
import { THUMB_VERSION } from './imageStats.js';

/** Moved less than this, in board millimetres, the board is where it was: the finder's own wobble. */
export const FOLLOW_MM = 1;

/** What a check came to, for the log and the note under the camera badge. */
export type DriftCheck =
  | { kind: 'stayed'; shiftMm: number }
  | { kind: 'followed'; shiftMm: number; fit: FoundBoard['fit'] }
  /** It moved, but a dart went in (or the darts started coming out) before the new calibration was ready. */
  | { kind: 'late'; shiftMm: number }
  /** The board could not be found on the photograph: the coach's "camera has moved" is the way out. */
  | { kind: 'lost' }
  /** No calibration, one made at another size, or a check already running. */
  | { kind: 'skipped' };

export interface BoardDriftDeps {
  find: (jpeg: Blob, options: FindOptions) => Promise<FinderResult>;
  /** The calibration in use now. */
  calibration: () => Calibration | null;
  /** The board-region thumbnail of the live picture, for the new calibration's reference. */
  reference: (region: Region) => Uint8Array | null;
  /** Keeps the calibration that followed the board. */
  save: (calibration: Calibration) => void;
  now: () => number;
}

/** Where the board's landmarks, its treble 20 and its bull went, at the one that moved most. */
function shiftMm(before: Matrix3, after: Matrix3): number {
  const back = invertHomography(before);
  if (!back) return Number.POSITIVE_INFINITY;
  const probes: Point[] = [...CALIBRATION_BOARD_POINTS, { x: 0, y: 102 }, { x: 0, y: 0 }];
  return Math.max(
    ...probes.map((p) => {
      const q = applyHomography(back, applyHomography(after, p));
      return Math.hypot(q.x - p.x, q.y - p.y);
    }),
  );
}

export interface BoardDrift {
  /** A photograph of the empty board; `quiet` says, when the answer is ready, whether it still is. */
  check(photo: GrabbedFrame, quiet: () => boolean): Promise<DriftCheck>;
}

export function createBoardDrift(deps: BoardDriftDeps): BoardDrift {
  let busy = false;

  return {
    async check(photo, quiet) {
      const calibration = deps.calibration();
      if (busy || !calibration || calibration.width !== photo.width || calibration.height !== photo.height) {
        return { kind: 'skipped' };
      }
      busy = true;
      try {
        const before = calibration.found ?? calibration.toImage;
        // A snap from where it was, and when that cannot hold (moved too far,
        // or turned), a search from nothing.
        let found = await deps.find(photo.jpeg, { near: before });
        if ('notFound' in found) found = await deps.find(photo.jpeg, {});
        if ('notFound' in found) return { kind: 'lost' };

        const shift = shiftMm(before, found.toImage);
        if (shift < FOLLOW_MM) return { kind: 'stayed', shiftMm: shift };
        if (!quiet()) return { kind: 'late', shiftMm: shift };

        // The picture's motion, from the board as found then to as found now,
        // applied to the calibration in use.
        const back = invertHomography(before);
        if (!back) return { kind: 'lost' };
        const motion = multiply3(found.toImage, back);
        const toImage = multiply3(motion, calibration.toImage);
        const size = { width: calibration.width, height: calibration.height };
        const made = calibrate(
          CALIBRATION_BOARD_POINTS.map((p) => applyHomography(toImage, p)),
          CALIBRATION_BOARD_POINTS,
          size,
        );
        if (!made) return { kind: 'lost' };
        // The reference the "moved" coach and the empty-board check compare
        // with, retaken of the board where it now is; the old one if the
        // picture cannot give one now.
        const region = boardRegion(made.toImage, size);
        const thumb = region ? deps.reference(region) : null;
        deps.save({
          ...calibration,
          ...made,
          found: [...found.toImage] as unknown as Matrix3,
          ts: deps.now(),
          ...(thumb ? { reference: Array.from(thumb), referenceVersion: THUMB_VERSION } : {}),
        });
        return { kind: 'followed', shiftMm: shift, fit: found.fit };
      } finally {
        busy = false;
      }
    },
  };
}
