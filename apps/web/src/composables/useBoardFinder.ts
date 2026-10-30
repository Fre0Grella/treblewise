/**
 * Finding the board for a screen: runs the finder and lights its steps up one
 * after another for the loading screen.
 *
 * The list is a loading screen, not a log: each step stays lit for a moment
 * whatever the finder's pace, and the list runs to its end before the result
 * is shown, so a fast find does not flash past and a slow one shows progress.
 */

import { FINDER_STEPS, type Matrix3 } from '@treblewise/core';
import { onScopeDispose, ref } from 'vue';

import { findBoardIn, type FinderResult, type FindOptions } from '../vision/findBoard.js';

/** How long each step stays the newest one lit. */
export const STEP_DWELL_MS = 180;

export function useBoardFinder(find: (jpeg: Blob, options: FindOptions) => Promise<FinderResult> = findBoardIn) {
  /** The index in FINDER_STEPS of the newest step lit, or null when not finding. */
  const shown = ref<number | null>(null);
  let run = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  /** The board in the photograph, or null when cancelled (or overtaken by another find) before it was done. */
  function findIn(jpeg: Blob, near?: Matrix3): Promise<FinderResult | null> {
    const mine = ++run;
    stop();
    shown.value = 0;
    let reached = 0;
    let result: FinderResult | null = null;
    let done = false;

    return new Promise((resolve) => {
      const finish = () => {
        stop();
        shown.value = null;
        resolve(result);
      };
      timer = setInterval(() => {
        if (mine !== run) return;
        if (shown.value !== null && shown.value < reached) shown.value += 1;
        else if (done) finish();
      }, STEP_DWELL_MS);

      void find(jpeg, {
        ...(near ? { near } : {}),
        onStep: (step) => {
          reached = Math.max(reached, FINDER_STEPS.indexOf(step));
        },
      })
        .catch((): FinderResult => ({ notFound: 'unreadable' }))
        .then((found) => {
          if (mine !== run) {
            resolve(null);
            return;
          }
          result = found;
          reached = FINDER_STEPS.length - 1;
          done = true;
        });
    });
  }

  function cancel() {
    run += 1;
    stop();
    shown.value = null;
  }

  onScopeDispose(cancel);

  return { shown, findIn, cancel };
}
