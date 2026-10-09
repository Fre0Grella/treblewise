import type { Matrix3, Point } from '@treblewise/core';
import { describe, expect, it, vi } from 'vitest';

import type { Calibration } from '@/storage/types.js';
import { createBoardWatcher, type BoardWatcherDeps } from '@/vision/boardWatcher.js';
import type { GrabbedFrame } from '@/vision/camera.js';
import type { Detection, Detector, ModelManifest } from '@/vision/detector.js';

const WIDTH = 640;
const HEIGHT = 480;
const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** The board-region thumbnail of the empty board, textured so "empty" is not trivially a flat image. */
const EMPTY = Uint8Array.from({ length: 64 * 64 }, (_, i) => 100 + ((i * 7919) % 23));
/** The same board with a dart in it: a dark streak in one corner. */
const DARTS = EMPTY.map((value, i) => (i % 64 > 30 && i % 64 < 36 && i < 40 * 64 ? 20 : value));
/** Another empty board, seen in other light: what the calibration's reference does not match. */
const ELSEWHERE = EMPTY.map((value) => value - 60).map((value, i) => (i % 64 < 20 ? 250 : value));

const calibration: Calibration = {
  imagePoints: [],
  toImage: IDENTITY,
  toBoard: IDENTITY,
  error: 0,
  width: WIDTH,
  height: HEIGHT,
  ts: 0,
  reference: Array.from(EMPTY),
};

const photo = (width = WIDTH): GrabbedFrame => ({ jpeg: new Blob(['x']), width, height: HEIGHT });
const at = (x: number, y: number) => ({ board: { x, y } });

const MANIFEST: ModelManifest = { name: 'test-model', file: 'x.onnx', sha256: 'x' };

function detection(board: Point): Detection {
  return { img: board, board, hit: { sector: 20, ring: 'treble', value: 60 }, confidence: 0.8 };
}

/** A model whose readings the test hands out one at a time. */
function fakes(overrides: Partial<BoardWatcherDeps> = {}) {
  const detector: Detector = { manifest: MANIFEST, detect: async () => [] };
  const pending: { resolve: (found: Detection[]) => void; reject: (cause: unknown) => void; args: unknown[] }[] = [];
  const deps: BoardWatcherDeps = {
    loadManifest: async () => MANIFEST,
    loadDetector: async () => detector,
    newDarts: (...args) =>
      new Promise<Detection[]>((resolve, reject) => {
        pending.push({ resolve, reject, args });
      }),
    ...overrides,
  };
  return { deps, pending };
}

async function readyWatcher(overrides: Partial<BoardWatcherDeps> = {}) {
  const { deps, pending } = fakes(overrides);
  const watcher = createBoardWatcher(deps);
  watcher.setCalibration(calibration);
  await watcher.switchModel(true);
  return { watcher, pending };
}

/** Lets the watcher's promise chains run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('settle', () => {
  it('cannot judge a photograph without a calibration that fits it', () => {
    const watcher = createBoardWatcher(fakes().deps);
    expect(watcher.settle(photo(), DARTS, null).kind).toBe('unfit');
    watcher.setCalibration(calibration);
    expect(watcher.settle(photo(1280), DARTS, null).kind).toBe('unfit');
    expect(watcher.settle(photo(), DARTS, null).kind).toBe('throw');
  });

  it('sees nothing thrown in an empty board with no darts in it', () => {
    const watcher = createBoardWatcher(fakes().deps);
    watcher.setCalibration(calibration);
    expect(watcher.settle(photo(), EMPTY, null).kind).toBe('empty');
  });

  it("measures the empty board against the one seen just before the visit's first dart", () => {
    const watcher = createBoardWatcher(fakes().deps);
    watcher.setCalibration(calibration);
    // The light changed since calibration: the reference no longer matches an empty board.
    expect(watcher.settle(photo(), ELSEWHERE, null).kind).toBe('throw');
    // A settle with no darts in the board remembers what the board looked like just before it.
    watcher.settle(photo(), DARTS, ELSEWHERE);
    expect(watcher.settle(photo(), ELSEWHERE, null).kind).toBe('empty');
  });

  it('keeps the recent empty board once darts are in the board', () => {
    const watcher = createBoardWatcher(fakes().deps);
    watcher.setCalibration(calibration);
    watcher.holds([at(0, 0)]);
    watcher.settle(photo(), DARTS, ELSEWHERE);
    // Not taken: with a dart in, "before" shows that dart, not an empty board.
    watcher.holds([]);
    expect(watcher.settle(photo(), ELSEWHERE, null).kind).toBe('throw');
  });

  it('reads nothing during the pull-out phase, and ends it at an empty board', () => {
    const watcher = createBoardWatcher(fakes().deps);
    watcher.setCalibration(calibration);
    watcher.holds([at(0, 0), at(10, 0), at(20, 0)]);
    watcher.visitOver();
    expect(watcher.state().pullingOut).toBe(true);
    expect(watcher.settle(photo(), DARTS, null).kind).toBe('pull-out');
    expect(watcher.settle(photo(), EMPTY, null).kind).toBe('emptied');
    expect(watcher.state().pullingOut).toBe(false);
    expect(watcher.settle(photo(), EMPTY, null).kind).toBe('empty');
  });

  it('ends the pull-out phase when a person says the darts are out', () => {
    const watcher = createBoardWatcher(fakes().deps);
    watcher.setCalibration(calibration);
    watcher.holds([at(0, 0)]);
    watcher.visitOver();
    watcher.dartsOut();
    expect(watcher.state().pullingOut).toBe(false);
    expect(watcher.settle(photo(), DARTS, null).kind).toBe('throw');
  });

  it('starts the pull-out phase once per visit, however often it is told the visit is over', () => {
    const watcher = createBoardWatcher(fakes().deps);
    watcher.setCalibration(calibration);
    watcher.holds([at(0, 0), at(10, 0), at(20, 0)]);
    watcher.visitOver();
    expect(watcher.settle(photo(), EMPTY, null).kind).toBe('emptied');
    watcher.visitOver();
    expect(watcher.state().pullingOut).toBe(false);
    // A dart of the next visit makes it a new visit, which can end in turn.
    watcher.holds([at(5, 5)]);
    watcher.visitOver();
    expect(watcher.state().pullingOut).toBe(true);
  });

  it('has nothing to end when told the darts are out outside the pull-out phase', async () => {
    const { watcher, pending } = await readyWatcher();
    watcher.holds([at(0, 0)]);
    watcher.dartsOut();
    void watcher.read(photo());
    await flush();
    expect(pending[0]!.args[3]).toEqual([{ board: { x: 0, y: 0 } }]);
  });

  it('takes an empty board mid-visit as an early pull: the darts not thrown missed', () => {
    const watcher = createBoardWatcher(fakes().deps);
    watcher.setCalibration(calibration);
    watcher.holds([at(0, 0)]);
    expect(watcher.settle(photo(), EMPTY, null)).toEqual({ kind: 'early-pull', missed: 2 });
    // The darts are out, so the visit ending now leaves nothing to pull.
    watcher.visitOver();
    expect(watcher.state().pullingOut).toBe(false);
  });

  it('forgets an early pull once a new dart goes in', () => {
    const watcher = createBoardWatcher(fakes().deps);
    watcher.setCalibration(calibration);
    watcher.holds([at(0, 0)]);
    watcher.settle(photo(), EMPTY, null);
    watcher.holds([at(5, 5)]);
    watcher.visitOver();
    expect(watcher.state().pullingOut).toBe(true);
  });

  it('cannot read past a dart with no position, or a full visit', () => {
    const watcher = createBoardWatcher(fakes().deps);
    watcher.setCalibration(calibration);
    watcher.holds([at(0, 0), {}]);
    expect(watcher.settle(photo(), DARTS, null).kind).toBe('unreadable');
    watcher.holds([at(0, 0), at(1, 1), at(2, 2)]);
    expect(watcher.settle(photo(), DARTS, null).kind).toBe('unreadable');
  });

  it('a visit put back on ends the pull-out phase', () => {
    const watcher = createBoardWatcher(fakes().deps);
    watcher.setCalibration(calibration);
    watcher.holds([at(0, 0), at(1, 1), at(2, 2)]);
    watcher.visitOver();
    watcher.holds([at(0, 0), at(1, 1)]);
    watcher.visitResumed();
    expect(watcher.state().pullingOut).toBe(false);
  });
});

describe('read', () => {
  it('proposes the strongest new dart, beside the darts in the board and against the visit photo', async () => {
    const { watcher, pending } = await readyWatcher();
    const visitPhoto = photo();
    watcher.holds([at(0, 0)]);
    watcher.setVisitPhoto(visitPhoto);
    const shot = photo();
    const reading = watcher.read(shot);
    await flush();
    expect(pending).toHaveLength(1);
    const [, frame, , inBoard, previous] = pending[0]!.args;
    expect(frame).toBe(shot);
    expect(inBoard).toEqual([{ board: { x: 0, y: 0 } }]);
    expect(previous).toBe(visitPhoto);
    pending[0]!.resolve([detection({ x: 30, y: 40 }), detection({ x: -50, y: 0 })]);
    expect(await reading).toEqual({ kind: 'proposal', dart: detection({ x: 30, y: 40 }) });
  });

  it('says when the model looked and found no new dart, and when it failed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { watcher, pending } = await readyWatcher();
    const none = watcher.read(photo());
    await flush();
    pending[0]!.resolve([]);
    expect(await none).toEqual({ kind: 'none' });

    const failed = watcher.read(photo());
    await flush();
    pending[1]!.reject(new Error('no WebGL'));
    expect(await failed).toEqual({ kind: 'failed' });
    warn.mockRestore();
  });

  it('is off until the model is switched on and ready', async () => {
    const { deps } = fakes();
    const watcher = createBoardWatcher(deps);
    watcher.setCalibration(calibration);
    expect(await watcher.read(photo())).toEqual({ kind: 'dropped', reason: 'off' });
    await watcher.switchModel(true);
    watcher.switchModel(false);
    expect(await watcher.read(photo())).toEqual({ kind: 'dropped', reason: 'off' });
  });

  it('calls a reading stale when the darts in the board changed while it ran', async () => {
    const { watcher, pending } = await readyWatcher();
    const reading = watcher.read(photo());
    await flush();
    watcher.holds([at(0, 0)]);
    pending[0]!.resolve([detection({ x: 30, y: 40 })]);
    expect(await reading).toEqual({ kind: 'dropped', reason: 'stale' });
  });

  it('reads one photograph at a time, and only the newest of those that waited', async () => {
    const { watcher, pending } = await readyWatcher();
    const first = watcher.read(photo());
    const second = watcher.read(photo());
    const third = watcher.read(photo());
    await flush();
    expect(pending).toHaveLength(1);
    expect(watcher.state().reading).toBe(true);
    expect(await second).toEqual({ kind: 'dropped', reason: 'superseded' });

    // A dart went in meanwhile: the first reading is stale, and the one that
    // waited is read against the board as it is when its turn comes.
    watcher.holds([at(0, 0)]);
    pending[0]!.resolve([]);
    expect(await first).toEqual({ kind: 'dropped', reason: 'stale' });
    await flush();
    expect(pending).toHaveLength(2);
    expect(pending[1]!.args[3]).toEqual([{ board: { x: 0, y: 0 } }]);
    pending[1]!.resolve([detection({ x: 30, y: 40 })]);
    expect((await third).kind).toBe('proposal');
    expect(watcher.state().reading).toBe(false);
  });
});

describe('the model', () => {
  it('finds the shipped model without loading it', async () => {
    const loadDetector = vi.fn(async () => null);
    const watcher = createBoardWatcher(fakes({ loadDetector }).deps);
    await watcher.findModel();
    expect(watcher.state().model).toEqual({ status: 'off', manifest: MANIFEST });
    expect(loadDetector).not.toHaveBeenCalled();
  });

  it('switches itself off when the model cannot run here', async () => {
    const watcher = createBoardWatcher(fakes({ loadDetector: async () => null }).deps);
    const changes: string[] = [];
    watcher.subscribe(() => changes.push(watcher.state().model.status));
    await watcher.switchModel(true);
    expect(watcher.state().model.status).toBe('unavailable');
    expect(changes).toContain('loading');
  });

  it('has no model to switch on when the site ships none, which is not the model failing', async () => {
    const loadDetector = vi.fn(async () => null);
    const watcher = createBoardWatcher(fakes({ loadManifest: async () => null, loadDetector }).deps);
    await watcher.switchModel(true);
    expect(watcher.state().model).toEqual({ status: 'none', manifest: null });
    expect(loadDetector).not.toHaveBeenCalled();
    watcher.switchModel(false);
    expect(watcher.state().model.status).toBe('none');
  });

  it('stays off when switched off while it was loading', async () => {
    const watcher = createBoardWatcher(fakes().deps);
    const loading = watcher.switchModel(true);
    watcher.switchModel(false);
    await loading;
    expect(watcher.state().model.status).toBe('off');
  });
});

describe('subscribe', () => {
  it('tells its owner when what it shows changes, and stops when asked', () => {
    const watcher = createBoardWatcher(fakes().deps);
    const listener = vi.fn();
    const unsubscribe = watcher.subscribe(listener);
    watcher.holds([at(0, 0)]);
    watcher.visitOver();
    expect(listener).toHaveBeenCalledTimes(1);
    const before = watcher.state();
    watcher.dartsOut();
    expect(watcher.state()).not.toBe(before);
    unsubscribe();
    watcher.holds([at(0, 0)]);
    watcher.visitOver();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
