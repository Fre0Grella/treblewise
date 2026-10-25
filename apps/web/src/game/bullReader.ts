/**
 * The camera reading darts thrown for the bull (issue #41), before a match.
 *
 * The darts stay in the board, as they do in a bull-off: each new one is read
 * against the photograph that showed the darts already there, the way a dart
 * of a visit is read beside the ones before it (vision/boardWatcher.ts, with a
 * visit as long as there are players). After a tie the round's darts come out,
 * and the tied players throw again into an empty board.
 *
 * The bull-off itself (whose turn, who is closest) is the component's; this
 * is told which darts are in the board, and says what it reads. Like the game
 * visit (game/gameVisit.ts), no framework: the camera hands it photographs.
 */

import type { Hit, Point } from '@treblewise/core';

import type { Calibration } from '../storage/types.js';
import type { GrabbedFrame } from '../vision/camera.js';
import type { BoardWatcher, BoardWatcherState } from '../vision/boardWatcher.js';

/**
 * `off`: nobody is to throw. `waiting`: for the next dart. `reading`: one.
 * `pull-out`: after a tie, the round's darts are still in the board.
 */
export type BullPhase = 'off' | 'waiting' | 'reading' | 'pull-out';

export interface BullReaderState {
  phase: BullPhase;
  model: BoardWatcherState['model'];
}

export interface BullReader {
  setCalibration(calibration: Calibration | null): void;
  /** Whether someone is still to throw: off once it is decided. */
  setActive(on: boolean): void;
  /** The darts of the round being thrown that are in the board now, read or tapped in, in throwing order. */
  holds(positions: readonly Point[]): void;
  /** A tie: the round's darts come out before it is thrown again. */
  roundOver(): void;
  /** A settled photograph: read for a new dart, or the board seen empty after a round. */
  settle(photo: GrabbedFrame, thumbnail: Uint8Array | undefined, before: Uint8Array | null | undefined): void;
  /** The board's thumbnail while it is still: empty after a round, the darts are out. */
  still(thumbnail: Uint8Array): void;
  /** "Darts out" pressed: for when the empty board is not seen. */
  dartsOut(): void;
  /** Switches the model on or off; it is loaded the first time. */
  switchModel(on: boolean): Promise<void>;
  state(): BullReaderState;
  subscribe(listener: () => void): () => void;
}

export function createBullReader(watcher: BoardWatcher, onDart: (hit: Hit, pos: Point) => void): BullReader {
  let active = true;
  /** The newest settled photograph, or the one just read. */
  let latest: GrabbedFrame | null = null;
  let held: Point[] = [];
  /** By how many darts it shows: the photograph each dart of the round first showed up in. */
  let shown: (GrabbedFrame | null)[] = [null];

  const listeners = new Set<() => void>();
  const phaseOf = (): BullPhase => {
    const seen = watcher.state();
    if (seen.pullingOut) return 'pull-out';
    if (!active) return 'off';
    return seen.reading ? 'reading' : 'waiting';
  };
  let current: BullReaderState = { phase: phaseOf(), model: watcher.state().model };
  const publish = () => {
    const next: BullReaderState = { phase: phaseOf(), model: watcher.state().model };
    if (next.phase === current.phase && next.model === current.model) return;
    current = next;
    listeners.forEach((listener) => listener());
  };
  watcher.subscribe(publish);

  /** Tells the watcher the darts in the board, and the photograph that shows exactly them. */
  function tellWatcher() {
    watcher.holds(held.map((board) => ({ board })));
    watcher.setVisitPhoto(held.length > 0 ? (shown[held.length] ?? null) : null);
  }

  async function read(photo: GrabbedFrame) {
    const reading = await watcher.read(photo);
    if (reading.kind !== 'proposal' || !active) return;
    // The photograph it was read in is the one that shows it: told so when
    // the bull-off says it is in the board (`holds`), which it does now.
    latest = photo;
    onDart(reading.dart.hit, reading.dart.board);
  }

  return {
    setCalibration(calibration) {
      watcher.setCalibration(calibration);
    },

    setActive(on) {
      active = on;
      publish();
    },

    holds(positions) {
      shown = shown.slice(0, Math.min(held.length, positions.length) + 1);
      for (let count = shown.length; count <= positions.length; count += 1) shown[count] = latest;
      held = [...positions];
      tellWatcher();
      publish();
    },

    roundOver() {
      watcher.visitOver();
      publish();
    },

    settle(photo, thumbnail, before) {
      latest = photo;
      if (watcher.state().model.status !== 'ready') return;
      const seen = watcher.settle(photo, thumbnail, before);
      // The board looked empty with darts still held: some are hard to see
      // (one hidden in the bull behind another). They are not out until the
      // bull-off says so.
      if (seen.kind === 'early-pull') tellWatcher();
      if (seen.kind === 'throw' && active) void read(photo);
      publish();
    },

    still(thumbnail) {
      if (watcher.still(thumbnail)) publish();
    },

    dartsOut() {
      watcher.dartsOut();
      publish();
    },

    async switchModel(on) {
      await watcher.switchModel(on);
      publish();
    },

    state: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
