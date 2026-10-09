/**
 * The game visit as a composable: one game visit, with its own board watcher,
 * per game screen, and its state as a ref. The game visit itself has no
 * framework (game/gameVisit.ts).
 */

import type { MatchSnapshot } from '@treblewise/core';
import { toValue, watch, type MaybeRefOrGetter } from 'vue';

import { createGameVisit, type GameVisitDeps } from '../game/gameVisit.js';
import type { Calibration } from '../storage/types.js';
import { useMatchesStore } from '../store/stores.js';
import { createBoardWatcher } from '../vision/boardWatcher.js';
import { raw, useExternal } from './external.js';

export interface GameVisitInputs {
  snapshot: MaybeRefOrGetter<MatchSnapshot | null>;
  /** The camera on, and "autoscorer scores" with it. */
  autoscoring: MaybeRefOrGetter<boolean>;
  calibration: MaybeRefOrGetter<Calibration | null>;
}

/** `deps` stand in for the match store's actions, in tests. */
export function useGameVisit(inputs: GameVisitInputs, deps?: GameVisitDeps) {
  const matches = useMatchesStore();
  const gameVisit = raw(
    createGameVisit(raw(createBoardWatcher()), deps ?? { throwDart: (hit, options) => matches.throwDart(hit, options) }),
  );

  // Before the first render, and in this order: whether a visit just ended
  // passes the turn depends on whether the autoscorer is scoring.
  watch(() => toValue(inputs.calibration), (calibration) => gameVisit.setCalibration(calibration), { immediate: true });
  watch(() => toValue(inputs.autoscoring), (on) => gameVisit.setAutoscoring(on), { immediate: true });
  watch(() => toValue(inputs.snapshot), (snapshot) => gameVisit.follow(snapshot), { immediate: true });

  return { gameVisit, state: useExternal(gameVisit) };
}
