import { MISS, dartEvent, hit, reduceMatch, type Hit, type Matrix3, type MatchEvent, type Point } from '@treblewise/core';
import { describe, expect, it, vi } from 'vitest';

import type { ThrowOptions } from '@/store/matches.js';
import type { Calibration } from '@/storage/types.js';
import { createBoardWatcher } from '@/vision/boardWatcher.js';
import type { GrabbedFrame } from '@/vision/camera.js';
import type { Detection, ModelManifest } from '@/vision/detector.js';
import { createGameVisit, type GameVisitSignal } from '@/game/gameVisit.js';

// The real board watcher, with only the model faked: what the game visit gets
// right or wrong is the order it tells the watcher things in, and a fake
// watcher would only restate what this file assumes the watcher does.

const WIDTH = 640;
const HEIGHT = 480;
const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** The board-region thumbnail of the empty board, textured so "empty" is not trivially a flat image. */
const EMPTY = Uint8Array.from({ length: 64 * 64 }, (_, i) => 100 + ((i * 7919) % 23));
/** The same board with darts in it. */
const DARTS = EMPTY.map((value, i) => (i % 64 > 30 && i % 64 < 36 && i < 40 * 64 ? 20 : value));

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

const config = {
  startScore: 501,
  inRule: 'straight' as const,
  outRule: 'double' as const,
  legsPerSet: 1,
  setsToWin: 1,
  players: [
    { id: 'ann', name: 'Ann' },
    { id: 'bob', name: 'Bob' },
  ],
};

const T20 = hit(20, 'treble');
const MANIFEST: ModelManifest = { name: 'test-model', file: 'x.onnx', sha256: 'x' };
const photo = (width = WIDTH): GrabbedFrame => ({ jpeg: new Blob(['x']), width, height: HEIGHT });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function detection(board: Point): Detection {
  return { img: board, board, hit: T20, confidence: 0.8 };
}

/** A dart thrown, by id, with a position unless it was entered by number. */
const dart = (id: string, value: Hit = T20, pos: Point | null = { x: 0, y: 103 }) =>
  dartEvent(value, { id, ts: 0, source: 'auto', ...(pos ? { pos } : {}) });

/**
 * A game visit on a real watcher, its model ready. `found` is what the model
 * reads on the next photograph; `thrown` records the darts it enters, and
 * `match` folds them in, as the store would.
 */
async function setup({ autoscoring = true }: { autoscoring?: boolean } = {}) {
  const model = { found: [] as Point[] };
  const newDarts = vi.fn(async (..._args: unknown[]) => model.found.map(detection));
  const watcher = createBoardWatcher({
    loadManifest: async () => MANIFEST,
    loadDetector: async () => ({ manifest: MANIFEST, detect: async () => [] }),
    newDarts,
  });
  await watcher.switchModel(true);

  let events: MatchEvent[] = [];
  const thrown: { hit: Hit; options: ThrowOptions }[] = [];
  const gameVisit = createGameVisit(watcher, {
    throwDart: (value, options) => {
      thrown.push({ hit: value, options });
      events = [...events, dartEvent(value, { ts: 0, source: options.source ?? 'manual', ...(options.pos ? { pos: options.pos } : {}) })];
    },
  });
  const signals: GameVisitSignal[] = [];
  gameVisit.listen((signal) => signals.push(signal));
  gameVisit.setCalibration(calibration);
  gameVisit.setAutoscoring(autoscoring);

  /** Sets the match to these darts, or to the ones entered so far. */
  const match = (next: MatchEvent[] = events) => {
    events = next;
    gameVisit.follow(reduceMatch(config, events));
  };
  const settle = async (thumbnail: Uint8Array, frame = photo()) => {
    gameVisit.settle(frame, thumbnail, null);
    await flush();
    return frame;
  };
  return { gameVisit, watcher, newDarts, model, thrown, signals, match, settle };
}

describe('where the game visit stands', () => {
  it('is thrown, then open until the next player throws, without the autoscorer', async () => {
    const { gameVisit, match } = await setup({ autoscoring: false });
    match([]);
    expect(gameVisit.state().position).toBe('throwing');
    match([dart('a'), dart('b')]);
    expect(gameVisit.state().position).toBe('throwing');
    match([dart('a'), dart('b'), dart('c')]);
    expect(gameVisit.state().position).toBe('open');
    expect(gameVisit.state().visit!.playerId).toBe('ann');
    match([dart('a'), dart('b'), dart('c'), dart('d')]);
    expect(gameVisit.state().position).toBe('throwing');
    expect(gameVisit.state().visit!.playerId).toBe('bob');
  });

  it('is held with the autoscorer scoring, and closed once the darts are out', async () => {
    const { gameVisit, match } = await setup();
    match([dart('a'), dart('b'), dart('c')]);
    expect(gameVisit.state().position).toBe('held');
    gameVisit.dartsOut();
    expect(gameVisit.state().position).toBe('closed');
    // Still the visit whose darts were last in the board: the darts stay drawn.
    expect(gameVisit.state().visit!.playerId).toBe('ann');
  });

  it('shows the last visit open again after a reload: closed is never written down', async () => {
    const first = await setup({ autoscoring: false });
    const thrown = [dart('a'), dart('b'), dart('c')];
    first.match(thrown);
    first.gameVisit.dartsOut();
    expect(first.gameVisit.state().position).toBe('closed');

    const reloaded = await setup({ autoscoring: false });
    reloaded.match(thrown);
    expect(reloaded.gameVisit.state().position).toBe('open');
  });

  it('closes the visit that wins the match', async () => {
    const { gameVisit } = await setup({ autoscoring: false });
    // A 41 leg: Ann checks out with S1, D20 on her first visit.
    gameVisit.follow(reduceMatch({ ...config, startScore: 41 }, [dart('a', hit(1, 'single')), dart('b', hit(20, 'double'))]));
    expect(gameVisit.state().position).toBe('closed');
  });
});

describe('the turn passing', () => {
  it('passes when a visit ends, without the autoscorer, but not on the first look at the match', async () => {
    const { signals, match } = await setup({ autoscoring: false });
    match([dart('a'), dart('b'), dart('c')]);
    expect(signals).toEqual([]);
    match([dart('a'), dart('b'), dart('c'), dart('d'), dart('e'), dart('f')]);
    expect(signals).toEqual(['turn-passed']);
  });

  it('waits for the darts to come out with the autoscorer scoring', async () => {
    const { gameVisit, signals, match } = await setup();
    match([]);
    match([dart('a'), dart('b'), dart('c')]);
    expect(signals).toEqual([]);
    gameVisit.dartsOut();
    expect(signals).toEqual(['turn-passed']);
  });

  it('does not pass when the match is won', async () => {
    const { gameVisit, signals } = await setup({ autoscoring: false });
    const short = { ...config, startScore: 41 };
    gameVisit.follow(reduceMatch(short, []));
    gameVisit.follow(reduceMatch(short, [dart('a', hit(1, 'single')), dart('b', hit(20, 'double'))]));
    expect(signals).toEqual([]);
  });
});

describe('the autoscorer in a game visit', () => {
  it('enters the dart it reads, with where it landed, and says so', async () => {
    const { model, thrown, signals, match, settle } = await setup();
    match([]);
    model.found = [{ x: 0, y: 103 }];
    await settle(DARTS);
    expect(thrown).toEqual([{ hit: T20, options: { pos: { x: 0, y: 103 }, source: 'auto', confidence: 0.8, call: true } }]);
    expect(signals).toEqual(['dart-read']);
  });

  it('reads nothing with the autoscorer not scoring, or the model not ready', async () => {
    const off = await setup({ autoscoring: false });
    off.match([]);
    off.model.found = [{ x: 0, y: 103 }];
    await off.settle(DARTS);
    expect(off.thrown).toEqual([]);

    const loading = await setup();
    await loading.watcher.switchModel(false);
    loading.match([]);
    loading.model.found = [{ x: 0, y: 103 }];
    await loading.settle(DARTS);
    expect(loading.thrown).toEqual([]);
  });

  it('reads nothing while a held visit is pulled out, and passes the turn once the board is empty', async () => {
    const { gameVisit, model, thrown, signals, match, settle } = await setup();
    match([dart('a'), dart('b'), dart('c')]);
    model.found = [{ x: 0, y: 103 }];
    await settle(DARTS); // a hand pulling the darts: all three still seen
    expect(thrown).toEqual([]);

    await settle(EMPTY);
    expect(signals).toEqual(['turn-passed']);
    expect(gameVisit.state().position).toBe('closed');

    model.found = [{ x: 30, y: -50 }];
    await settle(DARTS);
    expect(thrown).toHaveLength(1);
  });

  it('ends a visit pulled out early: the darts not thrown missed the board', async () => {
    const { gameVisit, model, thrown, signals, match, settle } = await setup();
    match([dart('a'), dart('b')]);
    await settle(EMPTY);
    expect(thrown).toEqual([{ hit: MISS, options: { source: 'auto' } }]);
    expect(signals).toEqual(['turn-passed']);

    // The miss is in the match: the visit is closed, not held, and with its
    // darts already out the next dart is read straight away.
    match();
    expect(gameVisit.state().position).toBe('closed');
    model.found = [{ x: 30, y: -50 }];
    await settle(DARTS);
    expect(thrown).toHaveLength(2);
  });

  it('ends the pull-out phase when the next visit is entered by hand', async () => {
    const { watcher, match } = await setup();
    match([dart('a'), dart('b'), dart('c')]);
    expect(watcher.state().pullingOut).toBe(true);
    match([dart('a'), dart('b'), dart('c'), dart('d')]);
    expect(watcher.state().pullingOut).toBe(false);
  });

  it('leaves the pull-out phase on after the winning visit: it is over, but nobody said the darts are out', async () => {
    const { gameVisit, watcher } = await setup();
    const short = { ...config, startScore: 41 };
    gameVisit.follow(reduceMatch(short, [dart('a', hit(1, 'single'))]));
    gameVisit.follow(reduceMatch(short, [dart('a', hit(1, 'single')), dart('b', hit(20, 'double'))]));
    expect(gameVisit.state().position).toBe('closed');
    expect(watcher.state().pullingOut).toBe(true);
  });
});

describe('the report', () => {
  it('can be opened once the visit has darts and a photograph that fits the calibration', async () => {
    const { gameVisit, match, settle } = await setup({ autoscoring: false });
    match([]);
    await settle(DARTS);
    expect(gameVisit.state().reportable).toBe(false); // no darts yet
    match([dart('a')]);
    expect(gameVisit.state().reportable).toBe(true);
    await settle(DARTS, photo(1280));
    expect(gameVisit.state().reportable).toBe(false); // the newest does not fit
  });

  it('opens on the photograph of the visit, not the hand that came after', async () => {
    const { gameVisit, match, settle } = await setup({ autoscoring: false });
    match([]);
    const withTheDart = await settle(DARTS);
    match([dart('a')]);
    await settle(DARTS); // a hand
    expect(gameVisit.state().photo).toBe(withTheDart);

    // A dart entered by hand is photographed when it is entered.
    match([dart('a'), dart('b', T20, null)]);
    const taken = photo();
    gameVisit.photographed(taken);
    expect(gameVisit.state().photo).toBe(taken);
  });
});

describe('the board watcher, as the game visit keeps it told', () => {
  // As the game played when it was tried on a real board: each photograph is
  // compared with the settle before it, whatever that showed.
  it('compares a new photograph with the settle before it, a hand included', async () => {
    const { newDarts, match, settle } = await setup();
    match([]);
    await settle(DARTS);
    match([dart('a')]);
    const theHand = await settle(DARTS); // a hand reaching in

    newDarts.mockClear();
    await settle(DARTS);
    expect(newDarts).toHaveBeenCalledTimes(1);
    expect(newDarts.mock.calls[0]![4]).toBe(theHand);
  });

  it('does not compare with the photograph taken for a dart entered by hand: that one is for the report', async () => {
    const { gameVisit, newDarts, match, settle } = await setup();
    match([]);
    const before = await settle(DARTS);
    match([dart('a')]);
    gameVisit.photographed(photo());

    newDarts.mockClear();
    await settle(DARTS);
    expect(newDarts.mock.calls[0]![4]).toBe(before);
  });
});
