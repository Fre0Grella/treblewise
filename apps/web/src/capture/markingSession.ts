/**
 * The marking session: the capture lab's try-it loop (see CONTEXT.md).
 *
 * You throw a dart, the board watcher says the board has settled, and the
 * photograph opens here to be marked. A label is only a label if it is
 * complete: every dart visible in the photograph has to be marked, or the
 * model is taught that a dart it can see is background. So each photograph
 * opens with the darts in the board already marked where they were, and only
 * the new one is left to tap. The darts stay put between throws, so the old
 * marks are right unless a dart was knocked, and a knocked one can be dragged.
 *
 * Nothing is ever saved except by Save (or "No new dart", which saves the
 * photograph without the model's marks): a frame with a visible dart unmarked,
 * or a model's guess nobody checked, would teach the model something wrong.
 * A settle — any moment the board goes still: an arm, a hand reaching for a
 * dart — is never a reason to save. A photograph someone has started on stays
 * put and the newer one waits behind it; an untouched one is simply replaced.
 *
 * The screen kept all of this in React state mirrored into refs, because
 * settles and readings arrive between renders, and saved from callbacks that
 * had to stay out of state updaters. Here it is plain state, with no
 * framework, like the board watcher it drives: the view hands it settles and
 * taps, renders `state()`, and asks nothing else.
 */

import { DARTS_PER_VISIT, type Hit, type Point } from '@treblewise/core';

import { caller, unlockCaller } from '../caller/caller.js';
import { strings } from '../i18n/index.js';
import { deleteFrame, putFrame, readDart } from '../storage/frames.js';
import type { Calibration, CapturedFrame, LabelledDart } from '../storage/types.js';
import { createBoardWatcher, type BoardWatcher, type BoardWatcherState } from '../vision/boardWatcher.js';
import type { GrabbedFrame } from '../vision/camera.js';

/**
 * With the autoscorer proposing, one visit in five is still left for a person
 * to mark from scratch. A visit where the model proposed anything can never be
 * in a test set (the model would be marking its own homework; see
 * ml/treblewise_ml/sources.py), so without these the test set would only grow when
 * proposals are switched off. It is decided per visit, not per photograph:
 * the three photographs of a visit are one unit to the split, and a visit is
 * only clean if the model was kept out of all of it.
 */
export const BLIND_SHARE = 0.2;

/** The photograph being marked. */
export interface MarkedPhoto {
  grabbed: GrabbedFrame;
  /** An object URL of the photograph, for the view to show; revoked once the photograph is done with. */
  url: string;
  /** The darts in the board come first, already marked. */
  darts: LabelledDart[];
  /** How many of `darts` were in the board when it opened. */
  inBoard: number;
  /** Anything tapped, dragged or removed: from then on it is worth saving. */
  edited: boolean;
  /** Darts the model proposed on this photograph, appended after the ones in the board. */
  proposed: number;
  /** The model is still looking. */
  checking: boolean;
  /** The model looked and found no new dart: said on screen, so it is not mistaken for proposals being off. */
  missed: boolean;
  /** The model could not run on this photograph. */
  failed: boolean;
  /** Held back from the model on purpose, so a person marks it: see BLIND_SHARE. */
  blind: boolean;
  /** The model that proposed, for the record. */
  model?: string;
}

/** Where a person goes when they leave: back to the setup (Done), or off the screen (Back). */
export type Exit = 'done' | 'back';

/** What a person says when asked about unsaved marks on their way out. */
export type LeaveAnswer = 'save' | 'discard' | 'stay';

export interface MarkingSessionState {
  photo: MarkedPhoto | null;
  /** A newer photograph waits behind the one being marked. */
  waiting: boolean;
  /** The darts in the board as of the last saved photograph. */
  inBoard: readonly LabelledDart[];
  /** Every dart a person tapped in this session, oldest first. */
  marked: readonly { hit: Hit; id: string }[];
  /** The darts of the photograph just saved, until the next one is tapped. */
  saved: readonly LabelledDart[] | null;
  /** The photograph being marked is worth saving: someone marked it, or a proposal on it can be let stand. */
  canSave: boolean;
  /** There is a mark to take off, or a saved photograph to take back. */
  canUndo: boolean;
  /** Photographs where the model proposed: let stand, or corrected. */
  tally: { letStand: number; corrected: number };
  /**
   * On the way out. `asking`: there are marks nobody saved, and the person is
   * being asked what to do with them; otherwise they are clear to go, and the
   * view takes them to `exit`.
   */
  leaving: { exit: Exit; asking: boolean } | null;
  /** The board watcher's pull-out phase: no photograph opens until the darts are out. */
  pullingOut: boolean;
  /** The model the site ships, and whether it is in use (the board watcher's). */
  model: BoardWatcherState['model'];
}

/** What the session reaches outside itself for: the real ones by default, fakes in tests. */
export interface MarkingSessionDeps {
  watcher: BoardWatcher;
  putFrame(frame: CapturedFrame): Promise<void>;
  deleteFrame(id: string): Promise<void>;
  /** Calls a score out loud. */
  say(hit: Hit): void;
  /**
   * Lets the page speak later: browsers allow it only from a gesture. Every tap
   * unlocks it, the caller on or not, so switching the caller on mid-session
   * does not leave the next score silent.
   */
  unlockSpeech(): void;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  /** For the blind roll: a number in [0, 1). */
  random(): number;
  newId(): string;
  now(): number;
}

export interface MarkingSession {
  /** The calibration darts are read and photographs saved under, or null when there is none. */
  setCalibration(calibration: Calibration | null): void;
  /** Whether scores are called out loud. */
  setCaller(on: boolean): void;
  /**
   * A settled photograph, with its board-region thumbnail and the board's just
   * before the change that settled. It opens, unless the one on screen is
   * worth saving: then it waits, and opens after Save or Skip. A photograph
   * the calibration does not fit is dropped, not even kept waiting.
   */
  settle(photo: GrabbedFrame, thumbnail?: Uint8Array, before?: Uint8Array | null): void;
  /** Taps a dart at a point of the photograph, in image pixels; the score is called. */
  mark(point: Point): void;
  /** Drags the mark at `index` to a point of the photograph, in image pixels. */
  move(index: number, point: Point): void;
  /** Saves the photograph as marked, and opens the one waiting behind it. True if a frame was written. */
  save(): Promise<boolean>;
  /** "No new dart": saves the photograph without the model's proposals on it, kept as rejected. True if a frame was written. */
  noNewDart(): Promise<boolean>;
  /** Drops the photograph without saving it, and opens the one waiting behind it. */
  skip(): void;
  /**
   * Takes the last mark off the photograph: the dart just tapped, or, once
   * those are gone, one that was in the board, which is how a dart that fell
   * out is removed. With no mark on screen it deletes the last saved photograph,
   * and then resolves true.
   */
  undo(): Promise<boolean>;
  /** "I pulled the darts out", before the third or after it. */
  boardCleared(): void;
  /** Done or Back: `state().leaving` says whether to ask first or go. */
  leave(exit: Exit): void;
  /** The answer to the leave prompt. True if a frame was written. */
  answer(choice: LeaveAnswer): Promise<boolean>;
  /**
   * Try-it is over. By the time anyone comes back the darts may be out, or
   * the camera recalibrated, so the visit ends with no darts in the board.
   */
  end(): void;
  /** Finds out which model the site ships, without loading it. */
  findModel(): Promise<void>;
  /** Switches the model's proposals on or off; it is loaded the first time. */
  switchModel(on: boolean): Promise<void>;
  state(): MarkingSessionState;
  subscribe(listener: () => void): () => void;
}

/**
 * A settled photograph held back while the one on screen is being marked. Its
 * thumbnails go with it, because the board watcher judges it when it opens,
 * against the darts in the board then, not when the camera went still.
 */
interface WaitingPhoto {
  grabbed: GrabbedFrame;
  thumbnail?: Uint8Array;
  before?: Uint8Array | null;
}

/** The marks a new photograph opens with: copies, so dragging one does not move a saved frame. */
function marksInBoard(inBoard: readonly LabelledDart[]): LabelledDart[] {
  return inBoard.map((dart) => ({ ...dart, img: { ...dart.img }, board: { ...dart.board } }));
}

/**
 * What is in the board once a photograph with these darts has been saved.
 * After a full visit the next photograph opens empty: those darts come out
 * next, and the board watcher's pull-out phase waits for them.
 */
function inBoardAfter(saved: readonly LabelledDart[]): LabelledDart[] {
  return saved.length >= DARTS_PER_VISIT ? [] : [...saved];
}

/** A photograph is worth saving once someone marked it, or let a proposal stand. */
function worthSaving(photo: MarkedPhoto | null): boolean {
  return photo !== null && photo.darts.length > 0 && (photo.edited || photo.proposed > 0);
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `frame-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

// Each looks its global up when called, not once at import: tests replace them.
export function realDeps(): MarkingSessionDeps {
  return {
    watcher: createBoardWatcher(),
    putFrame: (frame) => putFrame(frame),
    deleteFrame: (id) => deleteFrame(id),
    say: (hit) => {
      unlockCaller();
      caller().say(strings().caller.hit(hit));
    },
    unlockSpeech: () => unlockCaller(),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    random: () => Math.random(),
    newId,
    now: () => Date.now(),
  };
}

export function createMarkingSession(deps: MarkingSessionDeps = realDeps()): MarkingSession {
  const { watcher } = deps;
  let calibration: Calibration | null = null;
  let callerOn = true;

  let photo: MarkedPhoto | null = null;
  let waiting: WaitingPhoto | null = null;
  let inBoard: LabelledDart[] = [];
  let marked: { hit: Hit; id: string }[] = [];
  let saved: LabelledDart[] | null = null;
  /** The last saved photograph, to take back: how many darts it added, and the darts in the board before it. */
  let lastSaved: { id: string; added: number; inBoardBefore: LabelledDart[] } | null = null;
  let tally = { letStand: 0, corrected: 0 };
  let leaving: { exit: Exit; asking: boolean } | null = null;

  /**
   * Whether the model is kept out of the current visit. Rolled when a visit
   * starts, and only then: rolled on every photograph of an empty board, a
   * blind one (nothing proposed, so nothing to keep it on screen) was replaced
   * by the next settle and rolled again, until a proposal stuck. Visits were
   * almost never blind, and the test set never grew.
   */
  let blindVisit = false;
  const startVisit = () => {
    blindVisit = deps.random() < BLIND_SHARE;
  };
  startVisit();

  const snapshot = (): MarkingSessionState => {
    const watching = watcher.state();
    return {
      photo,
      waiting: waiting !== null,
      inBoard,
      marked,
      saved,
      canSave: worthSaving(photo),
      canUndo: (photo?.darts.length ?? 0) > 0 || lastSaved !== null,
      tally,
      leaving,
      pullingOut: watching.pullingOut,
      model: watching.model,
    };
  };
  // Built when something changes, not on every call: the view compares snapshots by identity.
  let current = snapshot();
  const listeners = new Set<() => void>();
  const publish = () => {
    current = snapshot();
    listeners.forEach((listener) => listener());
  };
  watcher.subscribe(() => {
    const watching = watcher.state();
    if (watching.pullingOut !== current.pullingOut || watching.model !== current.model) publish();
  });

  const call = (hit: Hit) => {
    if (callerOn) deps.say(hit);
  };

  /** Takes the photograph off screen, and lets its object URL go. */
  const close = () => {
    if (photo) deps.revokeObjectURL(photo.url);
    photo = null;
  };

  /** The photograph on screen, if nobody has started on it, goes. */
  const dropUntouched = () => {
    if (photo && !worthSaving(photo)) close();
  };

  /** The photograph that waited behind the last one, now that it is done with. */
  const openWaiting = () => {
    const next = waiting;
    waiting = null;
    if (next) open(next);
  };

  function open({ grabbed, thumbnail, before }: WaitingPhoto): void {
    // Judged now, not when the camera went still: a photograph can wait
    // behind the one being marked, and only the darts in the board when it
    // opens say what it shows.
    const settled = watcher.settle(grabbed, thumbnail, before);
    switch (settled.kind) {
      case 'unfit':
        return;
      // Pulling the darts out: nothing to mark until the board is empty, and an
      // empty board with no darts in it is nothing to mark either.
      case 'pull-out':
      case 'emptied':
      case 'empty':
        dropUntouched();
        return;
      // The darts came out before the visit was thrown in full, as in a game.
      // Opened, it asked for a dart on a photograph of the empty board, and the
      // next photograph opened with marks for darts that were gone.
      case 'early-pull':
        inBoard = [];
        startVisit();
        dropUntouched();
        return;
    }

    const darts = marksInBoard(inBoard);
    const { status, manifest } = watcher.state().model;
    const model = status === 'ready' ? manifest : null;
    const blind = model !== null && blindVisit;
    // Every dart in the lab has a position and a full visit is never in the
    // board when a photograph opens, so 'unreadable' does not happen here; if
    // it did, a person would mark it.
    const checking = model !== null && !blind && settled.kind === 'throw';
    close();
    photo = {
      grabbed,
      url: deps.createObjectURL(grabbed.jpeg),
      darts,
      inBoard: darts.length,
      edited: false,
      proposed: 0,
      checking,
      missed: false,
      failed: false,
      blind,
      ...(model ? { model: model.name } : {}),
    };
    if (!checking) return;

    void watcher.read(grabbed).then((reading) => {
      // A reading answers the photograph it was asked about, and no other.
      if (!photo || photo.grabbed !== grabbed) return;
      // A proposal goes only onto a photograph nobody has started on.
      const proposals: LabelledDart[] =
        reading.kind === 'proposal' && !photo.edited
          ? [{ img: reading.dart.img, board: reading.dart.board, hit: reading.dart.hit, by: 'model' }]
          : [];
      photo = reading.kind !== 'dropped'
        ? {
            ...photo,
            darts: [...photo.darts, ...proposals],
            proposed: proposals.length,
            checking: false,
            missed: reading.kind !== 'failed' && proposals.length === 0,
            failed: reading.kind === 'failed',
          }
        : // A reading of a board that is gone, or with no model at all: nothing
          // to show, but the photograph must stop saying the model is looking.
          { ...photo, checking: false };
      publish();
      proposals.forEach((dart) => call(dart.hit));
    });
  }

  /**
   * Writes the photograph away. `reject`: the model's marks on it come off,
   * and it is kept as the person says it is, a lesson in what is not a dart.
   */
  async function store(reject: boolean): Promise<boolean> {
    const opened = photo;
    // Only this photograph's proposals: a dart in the board the model proposed
    // earlier was confirmed then, and stays.
    const isProposal = (dart: LabelledDart, index: number) =>
      opened !== null && index >= opened.inBoard && dart.by === 'model';
    const frame =
      opened && reject
        ? { ...opened, darts: opened.darts.filter((dart, index) => !isProposal(dart, index)), edited: true }
        : opened;
    const rejected = opened && reject ? opened.darts.filter(isProposal) : [];
    leaving = null;
    // Not revoked yet: `frame` still points at it until it is written.
    photo = null;

    if (!frame || !calibration || (!worthSaving(frame) && rejected.length === 0)) {
      if (frame) deps.revokeObjectURL(frame.url);
      publish();
      return false;
    }

    const stored: CapturedFrame = {
      id: deps.newId(),
      ts: deps.now(),
      source: 'lab',
      width: frame.grabbed.width,
      height: frame.grabbed.height,
      jpeg: frame.grabbed.jpeg,
      calibration: {
        imagePoints: calibration.imagePoints,
        toImage: calibration.toImage,
        toBoard: calibration.toBoard,
        error: calibration.error,
        width: calibration.width,
        height: calibration.height,
      },
      darts: frame.darts,
      labelled: true,
      ...(frame.proposed > 0 && frame.model ? { model: frame.model } : {}),
      ...(rejected.length > 0 ? { rejected: rejected.map((dart) => ({ img: dart.img, board: dart.board })) } : {}),
    };
    if (frame.proposed > 0) {
      tally = frame.edited
        ? { ...tally, corrected: tally.corrected + 1 }
        : { ...tally, letStand: tally.letStand + 1 };
    }

    // Moved before the write, not after it: a settle during the write opens
    // with these darts in the board.
    const inBoardBefore = inBoard;
    inBoard = inBoardAfter(frame.darts);
    // The watcher is told of every dart still in the board, a full visit's
    // too: they stay until someone pulls them, and that is the pull-out phase.
    watcher.holds(frame.darts);
    watcher.setVisitPhoto(frame.darts.length > 0 ? frame.grabbed : null);
    if (frame.darts.length >= DARTS_PER_VISIT) {
      watcher.visitOver();
      startVisit();
    }
    deps.revokeObjectURL(frame.url);
    publish();

    await deps.putFrame(stored);
    lastSaved = { id: stored.id, added: frame.darts.length - Math.min(frame.inBoard, frame.darts.length), inBoardBefore };
    saved = frame.darts;
    openWaiting();
    publish();
    return true;
  }

  function skip(): void {
    close();
    leaving = null;
    openWaiting();
    publish();
  }

  function leave(exit: Exit): void {
    leaving = { exit, asking: worthSaving(photo) };
    publish();
  }

  return {
    setCalibration(next) {
      calibration = next;
      watcher.setCalibration(next);
    },

    setCaller(on) {
      callerOn = on;
    },

    settle(grabbed, thumbnail, before) {
      // A photograph the calibration does not fit is never shown, not even as waiting.
      if (!calibration || calibration.width !== grabbed.width || calibration.height !== grabbed.height) return;
      const settled: WaitingPhoto = { grabbed, thumbnail, before };
      if (worthSaving(photo)) waiting = settled;
      else open(settled);
      publish();
    },

    mark(point) {
      if (!photo || !calibration) return;
      const dart = readDart(calibration, point);
      deps.unlockSpeech();
      call(dart.hit);
      marked = [...marked, { hit: dart.hit, id: deps.newId() }];
      photo = { ...photo, darts: [...photo.darts, dart], edited: true };
      saved = null;
      publish();
    },

    move(index, point) {
      if (!photo || !calibration) return;
      const moved = readDart(calibration, point);
      photo = { ...photo, darts: photo.darts.map((dart, i) => (i === index ? moved : dart)), edited: true };
      publish();
    },

    save: () => store(false),
    noNewDart: () => store(true),
    skip,

    async undo() {
      // The visit photo no longer shows exactly the darts in the board.
      watcher.setVisitPhoto(null);
      if (photo && photo.darts.length > 0) {
        const wasNew = photo.darts.length > photo.inBoard;
        photo = {
          ...photo,
          darts: photo.darts.slice(0, -1),
          inBoard: Math.min(photo.inBoard, photo.darts.length - 1),
          edited: true,
        };
        if (wasNew) marked = marked.slice(0, -1);
        publish();
        return false;
      }
      const taken = lastSaved;
      if (!taken) return false;
      await deps.deleteFrame(taken.id);
      inBoard = taken.inBoardBefore;
      watcher.holds(taken.inBoardBefore);
      watcher.visitResumed();
      marked = marked.slice(0, marked.length - taken.added);
      lastSaved = null;
      publish();
      return true;
    },

    boardCleared() {
      watcher.dartsOut();
      inBoard = [];
      startVisit();
      if (photo) {
        // What was tapped on it stays; the darts that were in the board are gone.
        photo = {
          ...photo,
          darts: photo.darts.slice(photo.inBoard),
          inBoard: 0,
          edited: photo.darts.length > photo.inBoard,
        };
      }
      publish();
    },

    leave,

    async answer(choice) {
      const exit = leaving?.exit;
      if (!exit || choice === 'stay') {
        leaving = null;
        publish();
        return false;
      }
      const wrote = choice === 'save' ? await store(false) : (skip(), false);
      // Asked again, of whatever opened behind it: a photograph just opened
      // has nothing on it yet, so this goes.
      leave(exit);
      return wrote;
    },

    end() {
      waiting = null;
      close();
      leaving = null;
      inBoard = [];
      watcher.holds([]);
      watcher.setVisitPhoto(null);
      watcher.visitResumed();
      startVisit();
      publish();
    },

    findModel: () => watcher.findModel(),
    switchModel: (on) => watcher.switchModel(on),

    state: () => current,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
