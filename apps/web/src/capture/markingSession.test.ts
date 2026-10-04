import type { Matrix3, Point } from '@treblewise/core';
import { describe, expect, it } from 'vitest';

import type { Calibration, CapturedFrame } from '../storage/types.js';
import type { BoardWatcher, BoardWatcherState, Reading, Settled } from '../vision/boardWatcher.js';
import type { GrabbedFrame } from '../vision/camera.js';
import type { ModelManifest } from '../vision/detector.js';
import { BLIND_SHARE, createMarkingSession, type MarkingSessionDeps } from './markingSession.js';

const WIDTH = 640;
const HEIGHT = 480;
const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const MANIFEST: ModelManifest = { name: 'test-model', file: 'x.onnx', sha256: 'x' };

// Image pixels are board millimetres under it, so a tap at (0, 103) is a treble 20.
const calibration: Calibration = {
  imagePoints: [],
  toImage: IDENTITY,
  toBoard: IDENTITY,
  error: 0,
  width: WIDTH,
  height: HEIGHT,
  ts: 0,
};

const photo = (width = WIDTH): GrabbedFrame => ({ jpeg: new Blob(['x']), width, height: HEIGHT });
const T20: Point = { x: 0, y: 103 };
const T5: Point = { x: -32, y: 98 };

function proposal(board: Point): Reading {
  return { kind: 'proposal', dart: { img: board, board, hit: { sector: 20, ring: 'treble', value: 60 }, confidence: 0.9 } };
}

/**
 * A board watcher the test scripts: what each settle shows, and each reading,
 * handed out when the test says. It records what the session tells it.
 */
function fakeWatcher() {
  const told: string[] = [];
  const reads: { photo: GrabbedFrame; answer: (reading: Reading) => Promise<void> }[] = [];
  let shows: Settled = { kind: 'throw' };
  let state: BoardWatcherState = { pullingOut: false, reading: false, model: { status: 'off', manifest: MANIFEST } };
  const listeners = new Set<() => void>();
  const watcher: BoardWatcher = {
    setCalibration: () => undefined,
    holds: (darts) => {
      told.push(`holds ${darts.length}`);
    },
    setVisitPhoto: (visitPhoto) => told.push(visitPhoto ? 'visit photo' : 'no visit photo'),
    visitOver: () => told.push('visit over'),
    visitResumed: () => told.push('visit resumed'),
    dartsOut: () => told.push('darts out'),
    settle: () => shows,
    read: (read) =>
      new Promise((done) => {
        reads.push({
          photo: read,
          answer: async (reading) => {
            done(reading);
            await flush();
          },
        });
      }),
    findModel: async () => undefined,
    switchModel: async () => undefined,
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    watcher,
    told,
    reads,
    /** What the next settles show. */
    shows: (settled: Settled) => {
      shows = settled;
    },
    set: (change: Partial<BoardWatcherState>) => {
      state = { ...state, ...change };
      listeners.forEach((listener) => listener());
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setUp({ model = false, rolls = [0.99] }: { model?: boolean; rolls?: number[] } = {}) {
  const board = fakeWatcher();
  if (model) board.set({ model: { status: 'ready', manifest: MANIFEST } });
  const stored: CapturedFrame[] = [];
  const deleted: string[] = [];
  const said: string[] = [];
  const live = new Set<string>();
  let urls = 0;
  let unlocks = 0;
  let ids = 0;
  const dice = [...rolls];
  const deps: MarkingSessionDeps = {
    watcher: board.watcher,
    putFrame: async (frame) => {
      stored.push(frame);
    },
    deleteFrame: async (id) => {
      deleted.push(id);
    },
    say: (hit) => said.push(`${hit.ring} ${hit.sector}`),
    unlockSpeech: () => {
      unlocks += 1;
    },
    createObjectURL: () => {
      const url = `blob:${(urls += 1)}`;
      live.add(url);
      return url;
    },
    revokeObjectURL: (url) => live.delete(url),
    // The last roll repeats: the dice fall the same way unless a test says otherwise.
    random: () => (dice.length > 1 ? dice.shift()! : dice[0]!),
    newId: () => `id-${(ids += 1)}`,
    now: () => 1,
  };
  const session = createMarkingSession(deps);
  session.setCalibration(calibration);
  return { session, board, stored, deleted, said, live, dice, unlocks: () => unlocks };
}

/** A photograph settles and opens, and a dart is tapped on it. */
function throwAndMark(session: ReturnType<typeof setUp>['session'], at: Point = T20) {
  session.settle(photo());
  session.mark(at);
}

describe('a settle', () => {
  it.each<[Settled['kind'], { opens: boolean; dropsUntouched: boolean; emptiesBoard: boolean }]>([
    ['unfit', { opens: false, dropsUntouched: false, emptiesBoard: false }],
    ['pull-out', { opens: false, dropsUntouched: true, emptiesBoard: false }],
    ['emptied', { opens: false, dropsUntouched: true, emptiesBoard: false }],
    ['empty', { opens: false, dropsUntouched: true, emptiesBoard: false }],
    ['early-pull', { opens: false, dropsUntouched: true, emptiesBoard: true }],
    ['unreadable', { opens: true, dropsUntouched: true, emptiesBoard: false }],
    ['throw', { opens: true, dropsUntouched: true, emptiesBoard: false }],
  ])('showing %s', async (kind, expected) => {
    const { session, board } = setUp();
    throwAndMark(session);
    await session.save();
    session.settle(photo()); // untouched: nobody has started on it
    const untouched = session.state().photo;

    board.shows(kind === 'early-pull' ? { kind, missed: 2 } : ({ kind } as Settled));
    const next = photo();
    session.settle(next);

    const shown = session.state().photo;
    if (expected.opens) expect(shown?.grabbed).toBe(next);
    else if (expected.dropsUntouched) expect(shown).toBeNull();
    else expect(shown).toBe(untouched);
    expect(session.state().inBoard).toHaveLength(expected.emptiesBoard ? 0 : 1);
  });

  it('is dropped when the calibration does not fit it, not even kept waiting', () => {
    const { session } = setUp();
    throwAndMark(session);
    session.settle(photo(1280));
    expect(session.state().waiting).toBe(false);
  });

  it('waits behind a photograph worth saving, and never saves it', () => {
    const { session, stored } = setUp();
    throwAndMark(session);
    const marking = session.state().photo;
    session.settle(photo());
    session.settle(photo());
    expect(session.state().photo).toBe(marking);
    expect(session.state().waiting).toBe(true);
    expect(stored).toEqual([]);
  });

  it('waits behind a proposal nobody has looked at yet, as behind marks', async () => {
    const { session, board } = setUp({ model: true });
    session.settle(photo());
    await board.reads[0]!.answer(proposal(T20));
    session.settle(photo());
    expect(session.state().waiting).toBe(true);
  });

  it.each([['save'], ['skip']] as const)('the waiting photograph opens after %s', async (done) => {
    const { session } = setUp();
    throwAndMark(session);
    const next = photo();
    session.settle(next);
    if (done === 'save') await session.save();
    else session.skip();
    expect(session.state().photo?.grabbed).toBe(next);
    expect(session.state().waiting).toBe(false);
  });

  it('lets each photograph go once it is done with', async () => {
    const { session, live } = setUp();
    session.settle(photo());
    session.settle(photo()); // replaces the untouched one
    throwAndMark(session);
    await session.save();
    session.settle(photo());
    session.end();
    expect(live.size).toBe(0);
  });
});

describe('the darts in the board', () => {
  it('open the next photograph already marked, and only the new one is tapped', async () => {
    const { session } = setUp();
    throwAndMark(session, T20);
    await session.save();
    session.settle(photo());
    expect(session.state().photo).toMatchObject({ inBoard: 1, edited: false });
    expect(session.state().photo!.darts.map((dart) => dart.board)).toEqual([T20]);
    expect(session.state().canSave).toBe(false);
  });

  it('are copies, so dragging one does not move the saved photograph', async () => {
    const { session, stored } = setUp();
    throwAndMark(session, T20);
    await session.save();
    session.settle(photo());
    session.move(0, T5);
    expect(stored[0]!.darts[0]!.board).toEqual(T20);
    expect(session.state().photo!.darts[0]!.board).toEqual(T5);
  });

  it.each([
    [1, { inBoard: 1, told: ['holds 1', 'visit photo'] }],
    [2, { inBoard: 2, told: ['holds 2', 'visit photo'] }],
    // A full visit stays in the board until it is pulled: the pull-out phase.
    [3, { inBoard: 0, told: ['holds 3', 'visit photo', 'visit over'] }],
  ])('after the photograph with dart %i is saved', async (n, expected) => {
    const { session, board } = setUp();
    for (let i = 0; i < n; i += 1) {
      throwAndMark(session, { x: i * 5, y: 103 });
      board.told.length = 0;
      await session.save();
    }
    expect(session.state().inBoard).toHaveLength(expected.inBoard);
    expect(board.told).toEqual(expected.told);
  });

  it('are gone after "I pulled the darts out", but what was tapped since stays', async () => {
    const { session, board } = setUp();
    throwAndMark(session, T20);
    await session.save();
    throwAndMark(session, T5);
    session.boardCleared();
    expect(board.told).toContain('darts out');
    expect(session.state().inBoard).toEqual([]);
    expect(session.state().photo).toMatchObject({ inBoard: 0, edited: true });
    expect(session.state().photo!.darts.map((dart) => dart.board)).toEqual([T5]);
  });
});

describe('a reading', () => {
  it.each<[string, Reading, { darts: number; proposed: number; missed: boolean; failed: boolean }]>([
    ['a proposal', proposal(T20), { darts: 1, proposed: 1, missed: false, failed: false }],
    ['no new dart', { kind: 'none' }, { darts: 0, proposed: 0, missed: true, failed: false }],
    ['a failure', { kind: 'failed' }, { darts: 0, proposed: 0, missed: false, failed: true }],
    ['a stale one', { kind: 'dropped', reason: 'stale' }, { darts: 0, proposed: 0, missed: false, failed: false }],
    ['a superseded one', { kind: 'dropped', reason: 'superseded' }, { darts: 0, proposed: 0, missed: false, failed: false }],
  ])('shows %s on the photograph, which stops saying the model is looking', async (_, reading, expected) => {
    const { session, board } = setUp({ model: true });
    session.settle(photo());
    expect(session.state().photo!.checking).toBe(true);
    await board.reads[0]!.answer(reading);
    const shown = session.state().photo!;
    expect({ darts: shown.darts.length, proposed: shown.proposed, missed: shown.missed, failed: shown.failed }).toEqual(
      expected,
    );
    expect(shown.checking).toBe(false);
    expect(shown.model).toBe('test-model');
  });

  it('is not asked for without a model ready, or for a photograph it cannot read', () => {
    const off = setUp();
    off.session.settle(photo());
    expect(off.board.reads).toHaveLength(0);

    const unreadable = setUp({ model: true });
    unreadable.board.shows({ kind: 'unreadable' });
    unreadable.session.settle(photo());
    expect(unreadable.board.reads).toHaveLength(0);
  });

  it('puts no proposal on a photograph someone has started on', async () => {
    const { session, board } = setUp({ model: true });
    throwAndMark(session, T5);
    await board.reads[0]!.answer(proposal(T20));
    expect(session.state().photo!.darts.map((dart) => dart.board)).toEqual([T5]);
    expect(session.state().photo!.proposed).toBe(0);
  });

  it('answers only the photograph it was asked about', async () => {
    const { session, board } = setUp({ model: true });
    session.settle(photo());
    session.skip();
    const next = photo();
    board.shows({ kind: 'unreadable' });
    session.settle(next);
    await board.reads[0]!.answer(proposal(T20));
    expect(session.state().photo).toMatchObject({ grabbed: next, darts: [], proposed: 0 });
  });

  it('calls a proposal out loud when the caller is on', async () => {
    const on = setUp({ model: true });
    on.session.settle(photo());
    await on.board.reads[0]!.answer(proposal(T20));
    expect(on.said).toEqual(['treble 20']);

    const off = setUp({ model: true });
    off.session.setCaller(false);
    off.session.settle(photo());
    await off.board.reads[0]!.answer(proposal(T20));
    expect(off.said).toEqual([]);
  });
});

describe('the blind roll', () => {
  it('keeps the model out of a blind visit, through photographs that replace each other', () => {
    // Blind at the start, then the dice would say otherwise.
    const { session, board } = setUp({ model: true, rolls: [BLIND_SHARE / 2, 0.99] });
    session.settle(photo());
    session.settle(photo());
    expect(session.state().photo!.blind).toBe(true);
    expect(board.reads).toHaveLength(0);
  });

  it.each<[string, (session: ReturnType<typeof setUp>['session'], board: ReturnType<typeof fakeWatcher>) => Promise<void> | void]>([
    [
      'a full visit is saved',
      async (session) => {
        for (const x of [0, 5, 10]) {
          throwAndMark(session, { x, y: 103 });
          await session.save();
        }
      },
    ],
    ['the darts are pulled out', (session) => session.boardCleared()],
    [
      'the darts come out early',
      (session, board) => {
        board.shows({ kind: 'early-pull', missed: 2 });
        session.settle(photo());
        board.shows({ kind: 'throw' });
      },
    ],
    ['try-it ends', (session) => session.end()],
  ])('rolls again once %s', async (_, startNextVisit) => {
    const { session, board } = setUp({ model: true, rolls: [0.99, BLIND_SHARE / 2] });
    await startNextVisit(session, board);
    session.settle(photo());
    expect(session.state().photo!.blind).toBe(true);
  });
});

describe('saving', () => {
  it('writes each photograph exactly once, with its calibration', async () => {
    const { session, stored } = setUp();
    throwAndMark(session, T20);
    await session.save();
    await session.save(); // nothing open now
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: 'id-2', ts: 1, source: 'lab', labelled: true, width: WIDTH });
    expect(stored[0]!.calibration.toBoard).toEqual(IDENTITY);
    expect(session.state().saved!.map((dart) => dart.board)).toEqual([T20]);
  });

  it('saves nothing nobody marked', async () => {
    const { session, stored } = setUp();
    session.settle(photo());
    expect(session.state().canSave).toBe(false);
    await session.save();
    expect(stored).toEqual([]);
  });

  it.each([
    ['let stand', false, { letStand: 1, corrected: 0 }],
    ['corrected', true, { letStand: 0, corrected: 1 }],
  ])('tallies a proposal %s', async (_, correct, tally) => {
    const { session, board, stored } = setUp({ model: true });
    session.settle(photo());
    await board.reads[0]!.answer(proposal(T20));
    expect(session.state().canSave).toBe(true);
    if (correct) session.move(0, T5);
    await session.save();
    expect(session.state().tally).toEqual(tally);
    expect(stored[0]!.model).toBe('test-model');
  });

  it('keeps a rejected proposal as rejected, and the darts in the board as they were', async () => {
    const { session, board, stored } = setUp({ model: true });
    session.settle(photo());
    await board.reads[0]!.answer(proposal(T20));
    await session.save();
    session.settle(photo());
    await board.reads[1]!.answer(proposal(T5));
    await session.noNewDart();
    const [, rejected] = stored;
    expect(rejected!.darts.map((dart) => [dart.board, dart.by])).toEqual([[T20, 'model']]);
    expect(rejected!.rejected).toEqual([{ img: T5, board: T5 }]);
    expect(session.state().inBoard).toHaveLength(1);
  });

  it('clears the note of what was saved at the next tap', async () => {
    const { session } = setUp();
    throwAndMark(session);
    await session.save();
    throwAndMark(session, T5);
    expect(session.state().saved).toBeNull();
  });
});

describe('undo', () => {
  it.each<[string, (session: ReturnType<typeof setUp>['session']) => Promise<void> | void, { darts: Point[]; inBoard: number; marked: number; canSave: boolean }]>([
    ['the dart just tapped', (session) => throwAndMark(session, T5), { darts: [T20], inBoard: 1, marked: 1, canSave: true }],
    // A dart that fell out: taken off, but it was tapped on an earlier photograph.
    // Nothing left on it is worth saving, however much it was edited.
    ['a dart in the board', (session) => session.settle(photo()), { darts: [], inBoard: 0, marked: 1, canSave: false }],
  ])('takes off %s', async (_, then, expected) => {
    const { session } = setUp();
    throwAndMark(session, T20);
    await session.save();
    await then(session);
    await session.undo();
    const shown = session.state().photo!;
    expect(shown.darts.map((dart) => dart.board)).toEqual(expected.darts);
    expect(shown.inBoard).toBe(expected.inBoard);
    expect(shown.edited).toBe(true);
    expect(session.state().marked).toHaveLength(expected.marked);
    expect(session.state().canSave).toBe(expected.canSave);
  });

  it('takes back the last saved photograph when nothing is marked, and the visit with it', async () => {
    const { session, board, deleted } = setUp();
    for (const x of [0, 5, 10]) {
      throwAndMark(session, { x, y: 103 });
      await session.save();
    }
    board.told.length = 0;
    expect(await session.undo()).toBe(true);
    expect(deleted).toEqual(['id-6']);
    expect(session.state().inBoard).toHaveLength(2);
    expect(session.state().marked).toHaveLength(2);
    expect(board.told).toEqual(['no visit photo', 'holds 2', 'visit resumed']);
    expect(session.state().canUndo).toBe(false);
  });
});

describe('marking', () => {
  it('unlocks speech on every tap, and calls the score only with the caller on', () => {
    const { session, said, unlocks } = setUp();
    session.setCaller(false);
    throwAndMark(session);
    expect(unlocks()).toBe(1);
    expect(said).toEqual([]);
    session.setCaller(true);
    session.mark({ x: 0, y: 103 });
    expect(unlocks()).toBe(2);
    expect(said).toHaveLength(1);
  });

  it('says whether a save wrote anything, so the storage numbers refresh only then', async () => {
    const { session } = setUp();
    session.settle(photo());
    expect(await session.save()).toBe(false);
    throwAndMark(session);
    expect(await session.save()).toBe(true);
  });
});

describe('leaving', () => {
  it('goes straight away with nothing worth saving', () => {
    const { session } = setUp();
    session.settle(photo());
    session.leave('back');
    expect(session.state().leaving).toEqual({ exit: 'back', asking: false });
  });

  it.each([
    ['save', { exit: 'done', asking: false }, 1],
    ['discard', { exit: 'done', asking: false }, 0],
    ['stay', null, 0],
  ] as const)('with marks unsaved asks first, and "%s" settles it', async (choice, leaving, saves) => {
    const { session, stored } = setUp();
    throwAndMark(session);
    session.leave('done');
    expect(session.state().leaving).toEqual({ exit: 'done', asking: true });
    // True only when the answer wrote a frame: the storage numbers follow it.
    expect(await session.answer(choice)).toBe(saves > 0);
    expect(session.state().leaving).toEqual(leaving);
    expect(stored).toHaveLength(saves);
  });

  it('ends try-it with no darts in the board, and the watcher told', async () => {
    const { session, board } = setUp();
    throwAndMark(session);
    await session.save();
    throwAndMark(session, T5);
    session.settle(photo());
    board.told.length = 0;
    session.end();
    expect(session.state()).toMatchObject({ photo: null, waiting: false, inBoard: [] });
    expect(board.told).toEqual(['holds 0', 'no visit photo', 'visit resumed']);
  });
});

describe('state', () => {
  it('is the same object until something changes, and follows the pull-out phase', () => {
    const { session, board } = setUp();
    const seen: unknown[] = [];
    session.subscribe(() => seen.push(session.state()));
    expect(session.state()).toBe(session.state());
    board.set({ pullingOut: true });
    expect(session.state().pullingOut).toBe(true);
    board.set({ reading: true }); // nothing the session shows
    expect(seen).toHaveLength(1);
  });
});

