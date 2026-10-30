import { describe, expect, it } from 'vitest';

import type { Point } from '../../../src/board/geometry.js';
import { CALIBRATION_BOARD_POINTS } from '../../../src/vision/calibration.js';
import { applyHomography, invertHomography, multiply3, type Matrix3 } from '../../../src/vision/homography.js';
import { FINDER_STEPS, findBoard, type FinderStep, type FoundBoard } from '../../../src/vision/boardFinder/index.js';
import { boardMaps, BEDS, chooseTurn, findBull, fitRing, tiltedBoard } from '../../../src/vision/boardFinder/locate.js';
import { refine } from '../../../src/vision/boardFinder/refine.js';
import { fitEllipse } from '../../../src/vision/boardFinder/raster/ellipse.js';
import { FACE_ON, STEEP, renderBoard, rolled, type SyntheticBoard } from '../../fixtures/syntheticBoard.js';

/** Where the found landmarks and the treble 20 land on the true board, in millimetres: the worst of them. */
function worstMm(truth: Matrix3, found: Matrix3): number {
  const back = invertHomography(truth)!;
  const probes: Point[] = [...CALIBRATION_BOARD_POINTS, { x: 0, y: 102 }, { x: 0, y: 0 }];
  return Math.max(
    ...probes.map((p) => {
      const q = applyHomography(back, applyHomography(found, p));
      return Math.hypot(q.x - p.x, q.y - p.y);
    }),
  );
}

function found(board: SyntheticBoard, options?: Parameters<typeof findBoard>[1]): FoundBoard {
  const result = findBoard(renderBoard(board), options);
  if ('notFound' in result) throw new Error(`not found: ${result.notFound}`);
  return result;
}

const STEEP_SIZE = { width: 720, height: 1280 };

describe('findBoard', () => {
  it('finds a board face on, to half a millimetre', () => {
    const board = { width: 640, height: 640, toImage: FACE_ON };
    const result = found(board);
    expect(worstMm(FACE_ON, result.toImage)).toBeLessThan(0.5);
    expect(result.fit.ringFeatures).toBeGreaterThan(200);
    expect(result.fit.wireFeatures).toBeGreaterThan(70);
    expect(result.fit.worstSector).toBeNull();
  });

  it("finds it from the user's steep camera angle", () => {
    const result = found({ ...STEEP_SIZE, toImage: STEEP });
    expect(worstMm(STEEP, result.toImage)).toBeLessThan(0.5);
  });

  it('puts the 20 at the top when the phone is turned 15°', () => {
    const truth = rolled(15);
    expect(worstMm(truth, found({ width: 640, height: 640, toImage: truth }).toImage)).toBeLessThan(0.5);
  });

  it('copes with noise and light falling off across the board', () => {
    const board: SyntheticBoard = {
      ...STEEP_SIZE,
      toImage: STEEP,
      noise: 12,
      light: (x, y) => 0.55 + (0.45 * (x + y)) / 2000,
    };
    expect(worstMm(STEEP, found(board).toImage)).toBeLessThan(0.7);
  });

  it('copes with darts across the rings and a quarter of the double ring washed out', () => {
    const board: SyntheticBoard = {
      ...STEEP_SIZE,
      toImage: STEEP,
      darts: [
        { tip: { x: 4, y: 103 }, tail: { x: 60, y: 150 } },
        { tip: { x: -12, y: 100 }, tail: { x: -70, y: 140 } },
        { tip: { x: 30, y: -160 }, tail: { x: 90, y: -120 } },
      ],
      hidden: (p) => p.x > 0 && p.y > 0 && Math.hypot(p.x, p.y) > BEDS.doubleInner - 1,
    };
    expect(worstMm(STEEP, found(board).toImage)).toBeLessThan(0.7);
  });

  it('reports each step as it starts, in order', () => {
    const steps: FinderStep[] = [];
    found({ width: 640, height: 640, toImage: FACE_ON }, { onStep: (step) => steps.push(step) });
    expect(steps).toEqual(FINDER_STEPS);
  });

  it('snaps onto the wires from markers a few millimetres out, skipping the search', () => {
    const nudge: Matrix3 = [1.02, 0.015, 6, -0.01, 0.99, -5, 0, 0, 1]; // ~4–6 mm at the edge
    const steps: FinderStep[] = [];
    const result = found(
      { width: 640, height: 640, toImage: FACE_ON },
      { near: multiply3(FACE_ON, nudge), onStep: (step) => steps.push(step) },
    );
    expect(worstMm(FACE_ON, result.toImage)).toBeLessThan(0.5);
    expect(steps).toEqual(['colours', 'wires']);
  });

  it('says why when there is no board', () => {
    const blank = { data: new Uint8ClampedArray(320 * 320 * 4).fill(200), width: 320, height: 320 };
    expect(findBoard(blank)).toEqual({ notFound: 'noBull' });
  });

  it('calls a fit from far-off markers weak rather than guessing', () => {
    const away: Matrix3 = [1.6, 0, 120, 0, -1.6, 120, 0, 0, 1]; // 125 mm off
    expect(findBoard(renderBoard({ width: 640, height: 640, toImage: FACE_ON }), { near: away })).toEqual({
      notFound: 'weakFit',
    });
  });
});

describe('the steps on their own', () => {
  const maps = boardMaps(renderBoard({ ...STEEP_SIZE, toImage: STEEP }));

  it('finds the bull within a pixel or two', () => {
    const centre = findBull(maps)!;
    const truth = applyHomography(STEEP, { x: 0, y: 0 });
    expect(Math.hypot(centre.x - truth.x, centre.y - truth.y)).toBeLessThan(2);
  });

  it('fits the double ring to the bed edge', () => {
    const ring = fitRing(maps, findBull(maps)!)!;
    const circle = Array.from({ length: 72 }, (_, i) => {
      const t = (i * Math.PI) / 36;
      return applyHomography(STEEP, { x: BEDS.doubleOuter * Math.cos(t), y: BEDS.doubleOuter * Math.sin(t) });
    });
    const truth = fitEllipse(circle)!;
    expect(Math.abs(ring.cx - truth.cx)).toBeLessThan(1.5);
    expect(Math.abs(ring.cy - truth.cy)).toBeLessThan(1.5);
    expect(Math.abs(ring.a - truth.a)).toBeLessThan(2);
  });

  it('gets the tilt exactly from an exact ellipse and centre, so only the turn is open', () => {
    const circle = Array.from({ length: 72 }, (_, i) => {
      const t = (i * Math.PI) / 36;
      return applyHomography(STEEP, { x: BEDS.doubleOuter * Math.cos(t), y: BEDS.doubleOuter * Math.sin(t) });
    });
    const boardAt = tiltedBoard({ centre: applyHomography(STEEP, { x: 0, y: 0 }), ring: fitEllipse(circle)! })!;
    // Some turn of it is the true board: the best of a fine sweep is within a fraction of a millimetre.
    let best = Number.POSITIVE_INFINITY;
    for (let d = 0; d < 360; d += 0.05) best = Math.min(best, worstMm(STEEP, boardAt((d * Math.PI) / 180)));
    expect(best).toBeLessThan(0.3);
    expect(worstMm(STEEP, chooseTurn(maps, boardAt))).toBeLessThan(4);
  });

  it('refines from a homography several millimetres out', () => {
    const nudge: Matrix3 = [0.98, -0.02, 4, 0.01, 1.01, 3, 0.00003, 0, 1];
    const refined = refine(maps, multiply3(STEEP, nudge))!;
    expect(worstMm(STEEP, refined.toImage)).toBeLessThan(0.5);
  });
});
