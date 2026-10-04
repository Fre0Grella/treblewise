/**
 * The board watcher: what the board shows between settles, for whichever
 * screen owns the camera (see CONTEXT.md).
 *
 * The capture lab and a game watch the board the same way. A settle is a hand
 * as often as a dart, so each one is first asked whether the board looks
 * empty — against the empty board seen just before this visit's first dart,
 * and against the one taken at calibration — and what that means depends on
 * where the visit is: during the pull-out phase an empty board ends it; with
 * darts in the board it is an early pull; with none, nothing was thrown. And
 * both read a photograph for a new dart the same way (vision/autoscore.ts),
 * one photograph at a time, discarding a reading the board has moved on from.
 *
 * Both used to keep that state in a dozen refs each, mirrored from React state
 * because settles arrive between renders. Here it is plain state, with no
 * framework: the owner tells the watcher what it knows (which darts are in
 * the board, when a visit is over, when a person says the darts are out) and
 * decides when to act on a photograph. The game acts on every settle; the
 * capture lab acts when it opens one, which may be after a newer one waited.
 * So `settle` judges the board as it is at the call, not as it was when the
 * camera went still.
 */

import { DARTS_PER_VISIT, type Point } from '@treblewise/core';

import type { Calibration } from '../storage/types.js';
import { newDarts } from './autoscore.js';
import { THUMB_SIZE, type GrabbedFrame } from './camera.js';
import { loadDetector, loadManifest, type Detection, type Detector, type ModelManifest } from './detector.js';
import { boardLooksEmpty } from './imageStats.js';

/** A dart in the board. Entered by number, it has no position. */
export interface BoardDart {
  board?: Point;
}

/** What a settled photograph shows, given what the watcher knows about the board. */
export type Settled =
  /** No calibration, or one made at another resolution: nothing can be judged. */
  | { kind: 'unfit' }
  /** The pull-out phase: the visit's darts are still in the board. */
  | { kind: 'pull-out' }
  /** The pull-out phase just ended: the board is empty again. */
  | { kind: 'emptied' }
  /** The darts came out before the visit was thrown in full: `missed` darts missed the board. */
  | { kind: 'early-pull'; missed: number }
  /** An empty board with no darts in it: nothing was thrown. */
  | { kind: 'empty' }
  /** A new dart cannot be told apart: one in the board has no position, or the visit is full. */
  | { kind: 'unreadable' }
  /** It may hold a new dart. */
  | { kind: 'throw' };

/** What reading a photograph for a new dart gave. */
export type Reading =
  /** The strongest new dart. One per photograph: a second is rarer than a phantom. */
  | { kind: 'proposal'; dart: Detection }
  /** The model looked and found no new dart. */
  | { kind: 'none' }
  /** The model could not run on this photograph. */
  | { kind: 'failed' }
  /** Nothing to apply, and nothing to say about the board either. */
  | { kind: 'dropped'; reason: DropReason };

/**
 * Why a reading was dropped. `stale`: the darts in the board changed while it
 * was read, so it answers a board that is gone. `superseded`: a newer
 * photograph was asked for before this one's turn came. `off`: no model
 * switched on and ready, or no calibration.
 */
export type DropReason = 'stale' | 'superseded' | 'off';

/**
 * `none`: the site ships no model, so there is nothing to switch on.
 * `unavailable`: it ships one, but it cannot run here.
 */
export type ModelStatus = 'none' | 'off' | 'loading' | 'ready' | 'unavailable';

export interface BoardWatcherState {
  pullingOut: boolean;
  /** A photograph is being read. */
  reading: boolean;
  /** The model the site ships (known from its manifest), and whether it is in use. */
  model: { status: ModelStatus; manifest: ModelManifest | null };
}

/** What the watcher reaches outside itself for: the real ones by default, fakes in tests. */
export interface BoardWatcherDeps {
  loadManifest: () => Promise<ModelManifest | null>;
  loadDetector: () => Promise<Detector | null>;
  newDarts: typeof newDarts;
}

export interface BoardWatcher {
  /** The calibration photographs are judged and read under, or null when there is none. */
  setCalibration(calibration: Calibration | null): void;
  /**
   * The darts of the visit in progress that are in the board now. Call it
   * whenever they change. A dart going in after an early pull starts the
   * visit afresh; more darts than before during the pull-out phase means the
   * next visit has started, so the darts must be out.
   */
  holds(darts: readonly BoardDart[]): void;
  /**
   * The photograph that shows exactly the darts in the board, or null when no
   * photograph does (the visit photo). A new dart is told apart from the old
   * ones by what changed since it.
   */
  setVisitPhoto(photo: GrabbedFrame | null): void;
  /**
   * The visit is over: its darts stay in the board until they are pulled, so
   * the pull-out phase starts, unless they were already seen coming out. Said
   * again of the same visit, it changes nothing.
   */
  visitOver(): void;
  /** The visit turns out not to be over after all (a save taken back), or was abandoned: no pull-out phase. */
  visitResumed(): void;
  /**
   * A person says the darts are out: the pull-out phase ends, and the darts in
   * the board are forgotten. Outside the pull-out phase there is nothing to end.
   */
  dartsOut(): void;
  /**
   * What a settled photograph shows, judged now. `thumbnail` is its board-region
   * thumbnail; `before` the board's thumbnail just before the change that settled.
   */
  settle(photo: GrabbedFrame, thumbnail: Uint8Array | undefined, before: Uint8Array | null | undefined): Settled;
  /**
   * Reads a photograph for a new dart beside the darts in the board. One runs
   * at a time; of those asked for meanwhile, only the newest waits, and it is
   * read against the board as it is when its turn comes.
   */
  read(photo: GrabbedFrame): Promise<Reading>;
  /** Finds out which model the site ships, without loading it. */
  findModel(): Promise<void>;
  /** The model is loaded the first time it is switched on; if it cannot run here, it says so. */
  switchModel(on: boolean): Promise<void>;
  state(): BoardWatcherState;
  subscribe(listener: () => void): () => void;
}

const DEFAULT_DEPS: BoardWatcherDeps = { loadManifest, loadDetector, newDarts };

export function createBoardWatcher(deps: BoardWatcherDeps = DEFAULT_DEPS): BoardWatcher {
  let calibration: Calibration | null = null;
  let calibrationReference: Uint8Array | null = null;
  /** The empty board as it looked just before this visit's first dart. */
  let recentEmpty: Uint8Array | null = null;
  let darts: readonly BoardDart[] = [];
  let visitPhoto: GrabbedFrame | null = null;
  /** Bumped whenever the darts in the board change, so a reading can tell it is stale. */
  let board = 0;
  /** The darts of this visit were seen coming out before it was over. */
  let pulledEarly = false;
  /** The owner said this visit is over: said again, it is the same visit. */
  let ended = false;

  let detector: Detector | null = null;
  let wanted = false;
  let busy = false;
  let queued: { photo: GrabbedFrame; done: (reading: Reading) => void } | null = null;

  let current: BoardWatcherState = { pullingOut: false, reading: false, model: { status: 'off', manifest: null } };
  const listeners = new Set<() => void>();
  const update = (change: Partial<BoardWatcherState>) => {
    const next = { ...current, ...change };
    if (
      next.pullingOut === current.pullingOut &&
      next.reading === current.reading &&
      next.model.status === current.model.status &&
      next.model.manifest === current.model.manifest
    ) {
      return;
    }
    current = next;
    listeners.forEach((listener) => listener());
  };

  const clearBoard = () => {
    darts = [];
    visitPhoto = null;
    board += 1;
  };

  const looksEmpty = (thumbnail: Uint8Array | undefined) =>
    thumbnail !== undefined &&
    [recentEmpty, calibrationReference].some(
      (reference) => reference !== null && boardLooksEmpty(thumbnail, reference, THUMB_SIZE, THUMB_SIZE),
    );

  async function run(photo: GrabbedFrame): Promise<Reading> {
    const model = current.model.status === 'ready' ? detector : null;
    const calibrated = calibration;
    if (!model || !calibrated) return { kind: 'dropped', reason: 'off' };
    const inBoard = darts.flatMap((dart) => (dart.board ? [{ board: dart.board }] : []));
    const startedOn = board;
    try {
      const [best] = await deps.newDarts(model, photo, calibrated, inBoard, inBoard.length > 0 ? visitPhoto : null);
      if (board !== startedOn) return { kind: 'dropped', reason: 'stale' };
      return best ? { kind: 'proposal', dart: best } : { kind: 'none' };
    } catch (cause) {
      console.warn('[treblewise] the autoscorer failed on a photograph:', cause);
      return board !== startedOn ? { kind: 'dropped', reason: 'stale' } : { kind: 'failed' };
    }
  }

  async function findModel(): Promise<void> {
    if (current.model.manifest) return;
    const manifest = await deps.loadManifest();
    update({ model: { status: manifest ? current.model.status : 'none', manifest } });
  }

  async function next(photo: GrabbedFrame, done: (reading: Reading) => void): Promise<void> {
    busy = true;
    update({ reading: true });
    const reading = await run(photo);
    done(reading);
    const waiting = queued;
    queued = null;
    if (waiting) {
      void next(waiting.photo, waiting.done);
      return;
    }
    busy = false;
    update({ reading: false });
  }

  return {
    setCalibration(next) {
      calibration = next;
      calibrationReference = next?.reference ? Uint8Array.from(next.reference) : null;
    },

    holds(next) {
      if (next.length > darts.length) {
        pulledEarly = false;
        ended = false;
        if (current.pullingOut) update({ pullingOut: false });
      }
      if (next.length !== darts.length) board += 1;
      darts = [...next];
    },

    setVisitPhoto(photo) {
      visitPhoto = photo;
    },

    visitOver() {
      if (ended) return;
      ended = true;
      const pulled = pulledEarly;
      pulledEarly = false;
      if (!pulled) update({ pullingOut: true });
    },

    visitResumed() {
      ended = false;
      update({ pullingOut: false });
    },

    dartsOut() {
      if (!current.pullingOut) return;
      clearBoard();
      update({ pullingOut: false });
    },

    settle(photo, thumbnail, before) {
      if (!calibration || calibration.width !== photo.width || calibration.height !== photo.height) {
        return { kind: 'unfit' };
      }
      const empty = looksEmpty(thumbnail);

      if (current.pullingOut) {
        if (!empty) return { kind: 'pull-out' };
        clearBoard();
        update({ pullingOut: false });
        return { kind: 'emptied' };
      }

      if (darts.length > 0 && darts.length < DARTS_PER_VISIT && empty) {
        const missed = DARTS_PER_VISIT - darts.length;
        clearBoard();
        pulledEarly = true;
        return { kind: 'early-pull', missed };
      }
      if (darts.length >= DARTS_PER_VISIT || darts.some((dart) => !dart.board)) return { kind: 'unreadable' };
      if (darts.length === 0) {
        // Seconds old and in today's light: a better empty board than the calibration's.
        if (before) recentEmpty = before;
        if (empty) return { kind: 'empty' };
      }
      return { kind: 'throw' };
    },

    read(photo) {
      return new Promise((done) => {
        if (!busy) {
          void next(photo, done);
          return;
        }
        queued?.done({ kind: 'dropped', reason: 'superseded' });
        queued = { photo, done };
      });
    },

    findModel,

    async switchModel(on) {
      wanted = on;
      if (!on) {
        if (current.model.status !== 'unavailable' && current.model.status !== 'none') {
          update({ model: { ...current.model, status: 'off' } });
        }
        return;
      }
      if (detector) {
        update({ model: { ...current.model, status: 'ready' } });
        return;
      }
      update({ model: { ...current.model, status: 'loading' } });
      await findModel();
      if (!current.model.manifest) {
        update({ model: { ...current.model, status: 'none' } });
        return;
      }
      const loaded = await deps.loadDetector();
      if (!loaded) {
        update({ model: { ...current.model, status: 'unavailable' } });
        return;
      }
      detector = loaded;
      update({ model: { ...current.model, status: wanted ? 'ready' : 'off' } });
    },

    state: () => current,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
