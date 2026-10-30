/**
 * The board watcher: what the board shows between settles, for whichever
 * screen owns the camera (see CONTEXT.md).
 *
 * The capture lab and a game watch the board the same way. A settle is a hand
 * as often as a dart, so each one is first asked whether the board looks
 * empty — against the empty boards seen lately, and against the one taken at
 * calibration — and what that means depends on
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
import { emptyBoardScore, IMAGE_THRESHOLDS, referenceOf } from './imageStats.js';

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
  /**
   * During the pull-out phase, how far the board last looked from an empty
   * one: its most changed block, in grey levels. Under `limit` it is empty.
   * For the capture lab's readout, so a phase that never ends says why.
   */
  emptyCheck: { score: number; limit: number } | null;
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
   * The board that looked emptiest during the phase is kept as an empty board:
   * none of the others matched it, which is why a person had to say so.
   */
  dartsOut(): void;
  /**
   * What a settled photograph shows, judged now. `thumbnail` is its board-region
   * thumbnail; `before` the board's thumbnail just before the change that settled.
   */
  settle(photo: GrabbedFrame, thumbnail: Uint8Array | undefined, before: Uint8Array | null | undefined): Settled;
  /**
   * The board's thumbnail while it is still, between settles. During the
   * pull-out phase an empty board ends it, as a settle would (true when it
   * did). The settle after the darts come out is one look, and if a dip in the
   * video spoilt it the phase used to last until someone pressed "Darts out",
   * with the next visit's darts landing unread meanwhile.
   */
  still(thumbnail: Uint8Array): boolean;
  /**
   * Hears each settled photograph that shows an empty board: the one that
   * ends a pull-out, an empty board, an early pull. `quiet`, asked later, says
   * whether the board is still as it was then: no dart in since, and no
   * pull-out begun. The board can be found again on such a photograph and the
   * calibration moved with it, between visits and never during one.
   */
  onEmptyBoard(listener: (photo: GrabbedFrame, quiet: () => boolean) => void): () => void;
  /**
   * Reads a photograph for a new dart beside the darts in the board. One runs
   * at a time; of those asked for meanwhile, only the newest waits, and it is
   * read against the board as it is when its turn comes. `afterRead` runs the
   * moment this photograph's reading ends, before a waiting one starts: the
   * owner can then make it the visit photo the waiting one is compared with.
   */
  read(photo: GrabbedFrame, options?: { afterRead?: () => void }): Promise<Reading>;
  /** Finds out which model the site ships, without loading it. */
  findModel(): Promise<void>;
  /** The model is loaded the first time it is switched on; if it cannot run here, it says so. */
  switchModel(on: boolean): Promise<void>;
  state(): BoardWatcherState;
  subscribe(listener: () => void): () => void;
}

const DEFAULT_DEPS: BoardWatcherDeps = { loadManifest, loadDetector, newDarts };

/** How many of the empty boards seen lately are kept to compare with, besides the calibration's. */
const EMPTIES_KEPT = 4;
/** How often a still board's empty check is written to the console during the pull-out phase. */
const STILL_LOG_MS = 3000;

export interface BoardWatcherOptions {
  /**
   * How many darts a visit holds: three in a match. Throwing for the bull
   * leaves a dart per player in the board (game/bullReader.ts).
   */
  dartsPerVisit?: number;
}

export function createBoardWatcher(deps: BoardWatcherDeps = DEFAULT_DEPS, options: BoardWatcherOptions = {}): BoardWatcher {
  const perVisit = options.dartsPerVisit ?? DARTS_PER_VISIT;
  let calibration: Calibration | null = null;
  let calibrationReference: Uint8Array | null = null;
  /**
   * Empty boards seen lately, newest first: seconds or minutes old and in
   * today's light, better references than the calibration's. Only a board
   * known to be empty goes in. It used to be one board, taken just before
   * whichever settle came with no darts held; when the model missed a visit's
   * first dart, that was a board with the dart in it, the darts were never
   * seen to be out, the next visit's first dart landed unread during the
   * pull-out phase, and the same happened again, visit after visit.
   */
  let empties: Uint8Array[] = [];
  /** The board just before a settle is taken as an empty board once per visit, at its first settle. */
  let takeBefore = true;
  /** The board that looked emptiest during this pull-out phase, for `dartsOut`. */
  let emptiest: { thumbnail: Uint8Array; mean: number } | null = null;
  /** The board at the last settle read for a dart: with the visit's darts in it, once it is over. */
  let lastThrow: Uint8Array | null = null;
  let stillLoggedAt = Number.NEGATIVE_INFINITY;
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
  interface Asked {
    photo: GrabbedFrame;
    done: (reading: Reading) => void;
    afterRead?: () => void;
  }
  let queued: Asked | null = null;

  let current: BoardWatcherState = {
    pullingOut: false,
    emptyCheck: null,
    reading: false,
    model: { status: 'off', manifest: null },
  };
  const listeners = new Set<() => void>();
  const emptyListeners = new Set<(photo: GrabbedFrame, quiet: () => boolean) => void>();
  /** How many times a dart has gone in: an empty board stays quiet until the next one. */
  let dartsIn = 0;
  const update = (change: Partial<BoardWatcherState>) => {
    const next = { ...current, ...change };
    if (
      next.pullingOut === current.pullingOut &&
      next.emptyCheck?.score === current.emptyCheck?.score &&
      next.reading === current.reading &&
      next.model.status === current.model.status &&
      next.model.manifest === current.model.manifest
    ) {
      return;
    }
    current = next;
    listeners.forEach((listener) => listener());
  };

  /** The darts are out: the pull-out phase, if any, is over. */
  const clearBoard = () => {
    darts = [];
    visitPhoto = null;
    board += 1;
    takeBefore = true;
    emptiest = null;
    update({ pullingOut: false, emptyCheck: null });
  };

  const keepEmpty = (thumbnail: Uint8Array | null | undefined) => {
    if (!thumbnail || empties.includes(thumbnail)) return;
    empties = [thumbnail, ...empties].slice(0, EMPTIES_KEPT);
  };

  /** How close the thumbnail comes to an empty board: the best of every reference. */
  function emptyScore(thumbnail: Uint8Array | undefined): { worst: number; mean: number } | null {
    if (!thumbnail) return null;
    let best: { worst: number; mean: number } | null = null;
    for (const reference of [...empties, calibrationReference]) {
      const score = reference ? emptyBoardScore(thumbnail, reference, THUMB_SIZE, THUMB_SIZE) : null;
      if (!score) continue;
      best = best ? { worst: Math.min(best.worst, score.worst), mean: Math.min(best.mean, score.mean) } : score;
    }
    return best;
  }

  const looksEmpty = (thumbnail: Uint8Array | undefined) => {
    const score = emptyScore(thumbnail);
    return score !== null && score.worst < IMAGE_THRESHOLDS.emptyBlockDifference;
  };

  /**
   * Whether the board is empty, during the pull-out phase. Says how close it
   * came, and remembers the board that came closest: a hand or a dart left in
   * adds to the mean, so the emptiest is the board after the darts came out.
   */
  function pulledOut(thumbnail: Uint8Array | undefined, seenBy: 'settle' | 'still'): boolean {
    const score = emptyScore(thumbnail);
    if (!thumbnail || !score) return false;
    const limit = IMAGE_THRESHOLDS.emptyBlockDifference;
    const empty = score.worst < limit;
    if (!emptiest || score.mean < emptiest.mean) emptiest = { thumbnail, mean: score.mean };
    update({ emptyCheck: { score: Math.round(score.worst * 10) / 10, limit } });
    const now = Date.now();
    if (seenBy === 'settle' || empty || now - stillLoggedAt >= STILL_LOG_MS) {
      if (seenBy === 'still') stillLoggedAt = now;
      console.info(
        `[treblewise] pull-out, ${seenBy}: most changed block ${score.worst.toFixed(1)} (empty under ${limit}),` +
          ` mean ${score.mean.toFixed(1)}, against ${empties.length} recent empty board(s)` +
          `${calibrationReference ? ' and the calibration' : ''}`,
      );
    }
    return empty;
  }

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

  async function next({ photo, done, afterRead }: Asked): Promise<void> {
    busy = true;
    update({ reading: true });
    const started = performance.now();
    const reading = await run(photo);
    // The capture lab and a game read the same way; this says how long it took in each.
    console.info(`[treblewise] read in ${Math.round(performance.now() - started)} ms: ${reading.kind}`);
    afterRead?.();
    done(reading);
    const waiting = queued;
    queued = null;
    if (waiting) {
      void next(waiting);
      return;
    }
    busy = false;
    update({ reading: false });
  }

  /** What a settled photograph shows (see `settle`). */
  function judge(photo: GrabbedFrame, thumbnail: Uint8Array | undefined, before: Uint8Array | null | undefined): Settled {
    if (!calibration || calibration.width !== photo.width || calibration.height !== photo.height) {
      return { kind: 'unfit' };
    }

    if (current.pullingOut) {
      if (!pulledOut(thumbnail, 'settle')) return { kind: 'pull-out' };
      keepEmpty(thumbnail);
      clearBoard();
      return { kind: 'emptied' };
    }

    const empty = looksEmpty(thumbnail);
    if (darts.length > 0 && darts.length < perVisit && empty) {
      const missed = perVisit - darts.length;
      keepEmpty(thumbnail);
      clearBoard();
      pulledEarly = true;
      return { kind: 'early-pull', missed };
    }
    if (darts.length >= perVisit || darts.some((dart) => !dart.board)) return { kind: 'unreadable' };
    if (darts.length === 0) {
      // The board just before the visit's first settle has nothing of this
      // visit in it. Before a later one it may hold a dart the model missed.
      if (takeBefore && before) {
        keepEmpty(before);
        takeBefore = false;
      }
      if (empty) {
        keepEmpty(thumbnail);
        return { kind: 'empty' };
      }
    }
    lastThrow = thumbnail ?? null;
    return { kind: 'throw' };
  }

  return {
    setCalibration(next) {
      // Another calibration looks at another part of the picture: the empty
      // boards seen under the old one are thumbnails of something else.
      if (String(next?.toImage) !== String(calibration?.toImage)) {
        empties = [];
        takeBefore = true;
      }
      calibration = next;
      calibrationReference = referenceOf(next);
    },

    holds(next) {
      if (next.length > darts.length) {
        dartsIn += 1;
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
      if (!pulled) {
        emptiest = null;
        update({ pullingOut: true });
      }
    },

    visitResumed() {
      ended = false;
      update({ pullingOut: false, emptyCheck: null });
    },

    dartsOut() {
      if (!current.pullingOut) return;
      // Only if the darts are gone from it: pressed before they were pulled,
      // the emptiest board is the one with the darts still in.
      const gone =
        emptiest !== null &&
        lastThrow !== null &&
        (emptyBoardScore(emptiest.thumbnail, lastThrow, THUMB_SIZE, THUMB_SIZE)?.worst ?? 0) >=
          IMAGE_THRESHOLDS.emptyBlockDifference;
      if (gone) keepEmpty(emptiest?.thumbnail);
      clearBoard();
    },

    settle(photo, thumbnail, before) {
      const settled = judge(photo, thumbnail, before);
      if (settled.kind === 'emptied' || settled.kind === 'empty' || settled.kind === 'early-pull') {
        const at = dartsIn;
        const quiet = () => dartsIn === at && darts.length === 0 && !current.pullingOut;
        emptyListeners.forEach((listener) => listener(photo, quiet));
      }
      return settled;
    },

    still(thumbnail) {
      if (!current.pullingOut || !calibration || !pulledOut(thumbnail, 'still')) return false;
      keepEmpty(thumbnail);
      clearBoard();
      return true;
    },

    read(photo, options = {}) {
      return new Promise((done) => {
        const asked: Asked = { photo, done, ...(options.afterRead ? { afterRead: options.afterRead } : {}) };
        if (!busy) {
          void next(asked);
          return;
        }
        queued?.done({ kind: 'dropped', reason: 'superseded' });
        queued = asked;
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

    onEmptyBoard(listener) {
      emptyListeners.add(listener);
      return () => emptyListeners.delete(listener);
    },
  };
}
