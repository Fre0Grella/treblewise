/**
 * Calibration landmarks and the board wireframe.
 *
 * Calibration means: which four points on the photo are which four points on a
 * real board. They have to be points a person can see and hit within a
 * millimetre. They used to be the outer edge of the double on the centre line
 * of the 20, 6, 3 and 11, but no line marks a segment's centre: it was
 * guessed, and a marker guessed a few millimetres along the ring turns the
 * whole board drawn from it. Where a sector wire meets the outer double wire
 * is a corner the wires themselves draw. The four used are a quarter turn
 * apart, as far apart as points on a board can be, which is what keeps the
 * homography well conditioned.
 */

import { BOARD, type Point } from '../board/geometry.js';
import { applyHomography, type Matrix3 } from './homography.js';

export interface CalibrationLandmark {
  id: 'top' | 'right' | 'bottom' | 'left';
  /** Where it is in board millimetres. */
  board: Point;
  /** The two sectors whose dividing wire it sits on, the first one clockwise from it. */
  between: readonly [number, number];
}

/** A point on the outer edge of the double ring, `degrees` anticlockwise from the 6. */
function onDoubleEdge(degrees: number): Point {
  const rad = (degrees * Math.PI) / 180;
  return { x: BOARD.doubleOuterRadius * Math.cos(rad), y: BOARD.doubleOuterRadius * Math.sin(rad) };
}

/**
 * The outer edge of the double ring, where the wire between the 20 and the 1
 * meets it (top), the 6 and the 10 (right), the 3 and the 19 (bottom), and
 * the 11 and the 14 (left): each 9° clockwise of the segment's centre.
 */
export const CALIBRATION_LANDMARKS: readonly CalibrationLandmark[] = [
  { id: 'top', board: onDoubleEdge(81), between: [20, 1] },
  { id: 'right', board: onDoubleEdge(-9), between: [6, 10] },
  { id: 'bottom', board: onDoubleEdge(-99), between: [3, 19] },
  { id: 'left', board: onDoubleEdge(171), between: [11, 14] },
];

export const CALIBRATION_BOARD_POINTS: readonly Point[] = CALIBRATION_LANDMARKS.map((l) => l.board);

function circle(radius: number, step = 3): Point[] {
  const points: Point[] = [];
  for (let angle = 0; angle <= 360; angle += step) {
    const rad = (angle * Math.PI) / 180;
    points.push({ x: radius * Math.cos(rad), y: radius * Math.sin(rad) });
  }
  return points;
}

/**
 * The board's wires as polylines in board millimetres. Projected through the
 * calibration homography they draw the board over the camera image, which is
 * how a person can see that a calibration is right: the drawn wires sit on the
 * real ones, or they do not.
 */
export function boardWireframe(): Point[][] {
  const lines: Point[][] = [
    circle(BOARD.bullRadius),
    circle(BOARD.outerBullRadius),
    circle(BOARD.trebleInnerRadius),
    circle(BOARD.trebleOuterRadius),
    circle(BOARD.doubleInnerRadius),
    circle(BOARD.doubleOuterRadius),
  ];

  // The 20 wires between the sectors, from the outer bull to the double ring.
  for (let i = 0; i < 20; i += 1) {
    const rad = ((9 + i * 18) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    lines.push([
      { x: BOARD.outerBullRadius * cos, y: BOARD.outerBullRadius * sin },
      { x: BOARD.doubleOuterRadius * cos, y: BOARD.doubleOuterRadius * sin },
    ]);
  }

  return lines;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the board sits in the image, as a rectangle, with a margin in board
 * millimetres around it.
 *
 * The motion gate uses this to look only at the board: a dart is a rounding
 * error in a whole-frame average and obvious in a crop of the board alone.
 */
export function boardRegion(
  toImage: Matrix3,
  frame: { width: number; height: number },
  marginMm = 25,
): Rect | null {
  const radius = BOARD.doubleOuterRadius + marginMm;
  const corners: Point[] = [];
  for (let angle = 0; angle < 360; angle += 15) {
    const rad = (angle * Math.PI) / 180;
    corners.push(applyHomography(toImage, { x: radius * Math.cos(rad), y: radius * Math.sin(rad) }));
  }
  if (corners.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;

  const left = Math.max(0, Math.min(...corners.map((p) => p.x)));
  const right = Math.min(frame.width, Math.max(...corners.map((p) => p.x)));
  const top = Math.max(0, Math.min(...corners.map((p) => p.y)));
  const bottom = Math.min(frame.height, Math.max(...corners.map((p) => p.y)));

  const width = right - left;
  const height = bottom - top;
  if (width < 16 || height < 16) return null;

  return { x: left, y: top, width, height };
}
