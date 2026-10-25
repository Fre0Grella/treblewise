import type { Hit, Matrix3, Point } from '@treblewise/core';
import { describe, expect, it } from 'vitest';

import { createBullReader } from '@/game/bullReader.js';
import type { Calibration } from '@/storage/types.js';
import { createBoardWatcher, type BoardWatcherDeps } from '@/vision/boardWatcher.js';
import type { GrabbedFrame } from '@/vision/camera.js';
import type { Detection, Detector, ModelManifest } from '@/vision/detector.js';
import { THUMB_VERSION } from '@/vision/imageStats.js';

const WIDTH = 640;
const HEIGHT = 480;
const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** The empty board's thumbnail, textured; and with darts in it, a dark streak. */
const EMPTY = Uint8Array.from({ length: 64 * 64 }, (_, i) => 100 + ((i * 7919) % 23));
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
  referenceVersion: THUMB_VERSION,
};

const MANIFEST: ModelManifest = { name: 'test-model', file: 'x.onnx', sha256: 'x' };
/** The photographs, by name, so a test can say which one was compared with. */
const photos = new Map<string, GrabbedFrame>();
const photo = (name: string): GrabbedFrame => {
  if (!photos.has(name)) photos.set(name, { jpeg: new Blob([name]), width: WIDTH, height: HEIGHT });
  return photos.get(name)!;
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A bull reader on a real board watcher with a fake model: each reading
 * waits for the test to answer it, and says what it was asked with.
 */
async function bullOff(players: number, ready = true) {
  const detector: Detector = { manifest: MANIFEST, detect: async () => [] };
  const asked: { inBoard: Point[]; visitPhoto: GrabbedFrame | null; answer: (board: Point | null) => void }[] = [];
  const deps: BoardWatcherDeps = {
    loadManifest: async () => MANIFEST,
    loadDetector: async () => detector,
    newDarts: (_model, _photo, _calibration, inBoard, visitPhoto) =>
      new Promise<Detection[]>((resolve) => {
        asked.push({
          inBoard: inBoard.map((dart) => dart.board),
          visitPhoto,
          answer: (board) => resolve(board ? [{ img: board, board, hit: { sector: 0, ring: 'bull', value: 50 }, confidence: 0.9 }] : []),
        });
      }),
  };
  const read: Point[] = [];
  const held: Point[] = [];
  const reader = createBullReader(createBoardWatcher(deps, { dartsPerVisit: players }), (_hit: Hit, pos: Point) => {
    // The bull-off, as the component does it: the dart is in the board now.
    read.push(pos);
    held.push(pos);
    reader.holds(held);
  });
  reader.setCalibration(calibration);
  if (ready) await reader.switchModel(true);

  /** A dart lands, the board settles, and the model finds it at `board`. */
  const lands = async (name: string, board: Point | null) => {
    reader.settle(photo(name), DARTS, EMPTY);
    await flush();
    asked.at(-1)!.answer(board);
    await flush();
  };
  return { reader, asked, read, held, lands };
}

describe('the bull reader', () => {
  it('reads each dart beside the ones already in, against the photograph that showed them', async () => {
    const { asked, read, lands } = await bullOff(2);
    await lands('first', { x: 3, y: 0 });
    expect(asked[0]).toMatchObject({ inBoard: [], visitPhoto: null });

    await lands('second', { x: -8, y: 2 });
    expect(asked[1]!.inBoard).toEqual([{ x: 3, y: 0 }]);
    expect(asked[1]!.visitPhoto).toBe(photo('first'));
    expect(read).toEqual([
      { x: 3, y: 0 },
      { x: -8, y: 2 },
    ]);
  });

  it('leaves every dart in with more players than a visit has darts', async () => {
    const { read, lands } = await bullOff(5);
    for (let n = 0; n < 5; n += 1) await lands(`dart ${n}`, { x: n, y: 0 });
    expect(read).toHaveLength(5);
  });

  it('after a tie, waits for the darts to come out before reading again', async () => {
    const { reader, asked, held, lands } = await bullOff(2);
    await lands('ann', { x: 1, y: 0 });
    await lands('bob', { x: -1, y: 0 });

    held.length = 0;
    reader.holds([]);
    reader.roundOver();
    expect(reader.state().phase).toBe('pull-out');

    // Still in: nothing read.
    reader.settle(photo('still in'), DARTS, DARTS);
    await flush();
    expect(asked).toHaveLength(2);

    // Out, and a dart thrown again into the empty board.
    reader.still(EMPTY);
    expect(reader.state().phase).toBe('waiting');
    await lands('ann again', { x: 0, y: 4 });
    expect(asked[2]).toMatchObject({ inBoard: [], visitPhoto: null });
  });

  it('reads nothing once it is decided, or before the model is ready', async () => {
    const decided = await bullOff(2);
    decided.reader.setActive(false);
    decided.reader.settle(photo('after'), DARTS, EMPTY);
    await flush();
    expect(decided.asked).toHaveLength(0);
    expect(decided.reader.state().phase).toBe('off');

    const loading = await bullOff(2, false);
    loading.reader.settle(photo('early'), DARTS, EMPTY);
    await flush();
    expect(loading.asked).toHaveLength(0);
  });

  it('keeps a tapped dart, read with the photograph it settled in', async () => {
    const { reader, asked, held, lands } = await bullOff(2);
    // Tapped in, not read: the newest settled photograph is the one that shows it.
    reader.settle(photo('tapped'), DARTS, EMPTY);
    await flush();
    asked[0]!.answer(null);
    await flush();
    held.push({ x: 20, y: 0 });
    reader.holds(held);

    await lands('next', { x: 2, y: 0 });
    expect(asked[1]!.inBoard).toEqual([{ x: 20, y: 0 }]);
    expect(asked[1]!.visitPhoto).toBe(photo('tapped'));
  });
});
