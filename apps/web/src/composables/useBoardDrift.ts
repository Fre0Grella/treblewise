/**
 * Following the board for a screen (vision/boardDrift.ts): every photograph
 * of the empty board the game visit or the marking session sees is checked,
 * a calibration that followed the board is saved, and the screen is told what
 * is going on: a check running (the camera badge's cyan), the board lost at
 * the last one (its red: the calibration it had is still in use), and the
 * last time the calibration followed the board.
 */

import { onScopeDispose, ref, shallowRef, watch } from 'vue';

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
          : 'lost, the calibration it had kept';
  console.info(`[treblewise] board drift: ${mm}, ${what}`);
}

/** Where the photographs of the empty board come from, and, in a game, who waits for each check. */
export interface DriftSource {
  onEmptyBoard: BoardWatcher['onEmptyBoard'];
  /** The game visit holds the turn's beep until the check is over. */
  awaitBoard?: (check: Promise<unknown>) => void;
}

export function useBoardDrift(source: DriftSource, camera: Pick<Camera, 'sampleThumbnail'>) {
  const settings = useSettingsStore();
  /** A check is running. */
  const checking = ref(false);
  /** The last check could not find the board: the calibration it had is still in use. */
  const lost = ref(false);
  /** The last time the calibration followed the board, and how far. */
  const followed = shallowRef<{ shiftMm: number; at: number } | null>(null);
  const drift = createBoardDrift({
    find: findBoardIn,
    calibration: () => settings.settings.calibration,
    reference: (region) => camera.sampleThumbnail(region),
    save: (calibration) => settings.saveCalibration(calibration),
    now: () => Date.now(),
  });

  let running = 0;
  const stop = source.onEmptyBoard((photo, quiet) => {
    running += 1;
    checking.value = true;
    const check = drift.check(photo, quiet).then((result) => {
      logged(result);
      if (result.kind === 'lost') lost.value = true;
      else if (result.kind !== 'skipped') lost.value = false;
      if (result.kind === 'followed') followed.value = { shiftMm: result.shiftMm, at: Date.now() };
      return result;
    });
    source.awaitBoard?.(check);
    void check.finally(() => {
      running -= 1;
      checking.value = running > 0;
    });
  });
  onScopeDispose(stop);

  // A board found by a person, in the capture lab, is not lost.
  watch(
    () => settings.settings.calibration?.ts,
    () => {
      if (!checking.value) lost.value = false;
    },
  );

  return { checking, lost, followed };
}
