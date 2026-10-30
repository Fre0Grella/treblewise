/**
 * Following the board for a screen (vision/boardDrift.ts): every photograph
 * of the empty board the game visit or the marking session sees is checked,
 * a calibration that followed the board is saved, and the last time it did is
 * kept for the note under the camera badge.
 */

import { onScopeDispose, shallowRef } from 'vue';

import type { Camera } from './useCamera.js';
import type { BoardWatcher } from '../vision/boardWatcher.js';
import { createBoardDrift, type DriftCheck } from '../vision/boardDrift.js';
import { findBoardIn } from '../vision/findBoard.js';
import { useSettingsStore } from '../store/stores.js';

function logged(check: DriftCheck): void {
  if (check.kind === 'skipped') return;
  const mm = 'shiftMm' in check ? `${check.shiftMm.toFixed(1)} mm` : 'not found';
  const what =
    check.kind === 'followed'
      ? `followed (${check.fit.ringFeatures} edges, ${check.fit.wireFeatures} wires)`
      : check.kind === 'late'
        ? 'not followed: a dart went in first'
        : check.kind === 'stayed'
          ? 'stayed'
          : 'lost';
  console.info(`[treblewise] board drift: ${mm}, ${what}`);
}

export function useBoardDrift(source: Pick<BoardWatcher, 'onEmptyBoard'>, camera: Pick<Camera, 'sampleThumbnail'>) {
  const settings = useSettingsStore();
  /** The last time the calibration followed the board, and how far. */
  const followed = shallowRef<{ shiftMm: number; at: number } | null>(null);
  const drift = createBoardDrift({
    find: findBoardIn,
    calibration: () => settings.settings.calibration,
    reference: (region) => camera.sampleThumbnail(region),
    save: (calibration) => settings.saveCalibration(calibration),
    now: () => Date.now(),
  });

  const stop = source.onEmptyBoard((photo, quiet) => {
    void drift.check(photo, quiet).then((check) => {
      logged(check);
      if (check.kind === 'followed') followed.value = { shiftMm: check.shiftMm, at: Date.now() };
    });
  });
  onScopeDispose(stop);

  return { followed };
}
