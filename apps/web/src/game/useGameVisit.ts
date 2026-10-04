/**
 * The game visit as a React hook: one game visit, and one board watcher for it
 * to drive, per mount, and its state as React state. The game visit itself has
 * no framework (gameVisit.ts); this is the only part the Vue port rewrites, as
 * a composable.
 */

import type { MatchSnapshot } from '@treblewise/core';
import { useLayoutEffect, useState, useSyncExternalStore } from 'react';

import type { Calibration } from '../storage/types.js';
import type { BoardWatcher } from '../vision/boardWatcher.js';
import { useBoardWatcher } from '../vision/useBoardWatcher.js';
import { createGameVisit, type GameVisit, type GameVisitDeps, type GameVisitState } from './gameVisit.js';

export interface GameVisitInputs {
  snapshot: MatchSnapshot | null;
  /** The camera on, and "autoscorer scores" with it. */
  autoscoring: boolean;
  calibration: Calibration | null;
}

export function useGameVisit(
  { snapshot, autoscoring, calibration }: GameVisitInputs,
  deps?: GameVisitDeps,
): { gameVisit: GameVisit; state: GameVisitState; watcher: BoardWatcher } {
  const { watcher } = useBoardWatcher();
  const [gameVisit] = useState(() => createGameVisit(watcher, deps));

  // Layout effects, so the screen never paints a match the game visit has not
  // caught up with yet. Autoscoring first: whether a visit just ended passes
  // the turn depends on it.
  useLayoutEffect(() => {
    gameVisit.setCalibration(calibration);
  }, [gameVisit, calibration]);
  useLayoutEffect(() => {
    gameVisit.setAutoscoring(autoscoring);
  }, [gameVisit, autoscoring]);
  useLayoutEffect(() => {
    gameVisit.follow(snapshot);
  }, [gameVisit, snapshot]);

  const state = useSyncExternalStore(gameVisit.subscribe, gameVisit.state);
  return { gameVisit, state, watcher };
}

/** The state of a game visit made elsewhere, for a component it is handed to. */
export function useGameVisitState(gameVisit: GameVisit): GameVisitState {
  return useSyncExternalStore(gameVisit.subscribe, gameVisit.state);
}
