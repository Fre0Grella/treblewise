import { CALIBRATION_BOARD_POINTS, applyHomography, multiply3, type FoundBoard, type Matrix3 } from '@treblewise/core';
import { describe, expect, it } from 'vitest';

import type { Calibration } from '@/storage/types.js';
import { FOLLOW_MM, createBoardDrift } from '@/vision/boardDrift.js';
import type { GrabbedFrame } from '@/vision/camera.js';
import type { FinderResult, FindOptions } from '@/vision/findBoard.js';

const SIZE = { width: 720, height: 1280 };
/** Board → image, roughly the user's camera. */
const FOUND: Matrix3 = [0.667, -0.099, 281.5, -0.109, -1.415, 620.7, -0.00066, -0.00053, 1];
/** A hand adjustment made after the board was found: the person's calibration is a little off the finder's. */
const ADJUSTED: Matrix3 = multiply3(FOUND, [1.004, 0, 0.6, 0, 0.997, -0.4, 0, 0, 1]);

const PHOTO: GrabbedFrame = { jpeg: new Blob(['x']), ...SIZE };

function calibration(): Calibration {
  return {
    imagePoints: CALIBRATION_BOARD_POINTS.map((p) => applyHomography(ADJUSTED, p)),
    toImage: ADJUSTED,
    toBoard: ADJUSTED,
    error: 0,
    ...SIZE,
    ts: 1,
    reference: [1, 2, 3],
    referenceVersion: 2,
    found: FOUND,
  };
}

const FIT: FoundBoard['fit'] = { ringFeatures: 280, wireFeatures: 78, medianMm: 0.9, p90Mm: 2.2, worstSector: null };
const board = (toImage: Matrix3): FoundBoard => ({ toImage, imagePoints: [], fit: FIT });

/** The board moved `dx`, `dy` millimetres on the wall: board point p is now seen where p + d was. */
const moved = (dx: number, dy: number): Matrix3 => multiply3(FOUND, [1, 0, dx, 0, 1, dy, 0, 0, 1]);

function drift(answers: FinderResult[], current: Calibration | null = calibration()) {
  const asked: FindOptions[] = [];
  const saved: Calibration[] = [];
  const check = createBoardDrift({
    find: async (_jpeg, options) => {
      asked.push(options);
      return answers.shift() ?? { notFound: 'noBull' };
    },
    calibration: () => current,
    reference: () => new Uint8Array([9, 9]),
    save: (c) => saved.push(c),
    now: () => 42,
  });
  return { check: check.check, asked, saved };
}

describe('following the board', () => {
  it('leaves the calibration alone when the board moved less than the finder wobbles', async () => {
    const { check, saved, asked } = drift([board(moved(0.3, -0.2))]);
    const result = await check(PHOTO, () => true);
    expect(result.kind).toBe('stayed');
    expect(saved).toEqual([]);
    expect(asked[0]!.near).toEqual(FOUND);
  });

  it('moves the calibration with the board, keeping the hand adjustment, with a fresh reference', async () => {
    const now = moved(2.5, -1);
    const { check, saved } = drift([board(now)]);
    const result = await check(PHOTO, () => true);
    expect(result).toMatchObject({ kind: 'followed' });
    expect((result as { shiftMm: number }).shiftMm).toBeGreaterThan(FOLLOW_MM);

    const next = saved[0]!;
    // The person's calibration, moved as the board moved: motion = now · FOUND⁻¹.
    const want = multiply3(now, [1.004, 0, 0.6, 0, 0.997, -0.4, 0, 0, 1]);
    for (const p of [...CALIBRATION_BOARD_POINTS, { x: 0, y: 102 }]) {
      const got = applyHomography(next.toImage, p);
      const expected = applyHomography(want, p);
      expect(Math.hypot(got.x - expected.x, got.y - expected.y)).toBeLessThan(1e-6);
    }
    expect(next.found).toEqual(now);
    expect(next.reference).toEqual([9, 9]);
    expect(next.ts).toBe(42);
    expect(() => structuredClone(next)).not.toThrow();
  });

  it('does not follow when a dart went in before the new calibration was ready', async () => {
    const { check, saved } = drift([board(moved(3, 0))]);
    expect((await check(PHOTO, () => false)).kind).toBe('late');
    expect(saved).toEqual([]);
  });

  it('searches from nothing when the snap cannot hold', async () => {
    const { check, saved, asked } = drift([{ notFound: 'weakFit' }, board(moved(-12, 4))]);
    expect((await check(PHOTO, () => true)).kind).toBe('followed');
    expect(asked.map((options) => options.near === undefined)).toEqual([false, true]);
    expect(saved).toHaveLength(1);
  });

  it('says the board is lost when neither finds it, and changes nothing', async () => {
    const { check, saved } = drift([{ notFound: 'weakFit' }, { notFound: 'noBull' }]);
    expect((await check(PHOTO, () => true)).kind).toBe('lost');
    expect(saved).toEqual([]);
  });

  it('follows a calibration placed by hand, from its own homography', async () => {
    const { found: _found, ...byHand } = calibration();
    const { check, asked } = drift([board(moved(0, 0))], byHand);
    await check(PHOTO, () => true);
    expect(asked[0]!.near).toEqual(ADJUSTED);
  });

  it('skips a photograph of another size, or with no calibration', async () => {
    expect((await drift([]).check({ ...PHOTO, width: 1280, height: 720 }, () => true)).kind).toBe('skipped');
    expect((await drift([], null).check(PHOTO, () => true)).kind).toBe('skipped');
  });
});
