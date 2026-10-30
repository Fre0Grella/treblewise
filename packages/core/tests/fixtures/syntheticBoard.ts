/**
 * A dartboard rendered through a known homography, for testing the board
 * finder without anyone's photographs. Each pixel is the average of 2×2
 * samples, so edges fall between pixels as they do in a camera.
 */

import { BOARD, SECTORS, sectorAtAngle, type Point } from '../../src/board/geometry.js';
import { applyHomography, invertHomography, type Matrix3 } from '../../src/vision/homography.js';
import type { RgbaImage } from '../../src/vision/boardFinder/raster/masks.js';

type Rgb = [number, number, number];

const WALL: Rgb = [215, 200, 172];
const SURROUND: Rgb = [24, 24, 26];
const BLACK: Rgb = [32, 32, 34];
const CREAM: Rgb = [226, 216, 192];
const RED: Rgb = [198, 36, 42];
const GREEN: Rgb = [28, 148, 72];
const WIRE: Rgb = [182, 182, 186];
const DART: Rgb = [60, 62, 70];
const PALE: Rgb = [200, 196, 190];

export interface Dart {
  /** Board millimetres, where the tip is. */
  readonly tip: Point;
  /** Board millimetres, where the barrel and flight reach to. */
  readonly tail: Point;
}

export interface SyntheticBoard {
  readonly width: number;
  readonly height: number;
  /** Board millimetres → image pixels. */
  readonly toImage: Matrix3;
  /** Grey levels of uniform noise, ± this. */
  readonly noise?: number;
  /** Brightness across the picture, 1 = as painted. */
  readonly light?: (x: number, y: number) => number;
  readonly darts?: readonly Dart[];
  /** Board points painted a dull grey, as glare or a pale patch would. */
  readonly hidden?: (p: Point) => boolean;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** What colour a real board is at a point, in board millimetres. */
function paint(p: Point, board: SyntheticBoard): Rgb {
  for (const dart of board.darts ?? []) if (distanceToSegment(p, dart.tip, dart.tail) < 3) return DART;
  const r = Math.hypot(p.x, p.y);
  if (r > BOARD.boardRadius) return WALL;
  if (r > BOARD.doubleEdgeRadius) return SURROUND;
  if (board.hidden?.(p)) return PALE;

  const wireRadii = [
    BOARD.bullRadius,
    BOARD.outerBullRadius,
    BOARD.trebleInnerRadius,
    BOARD.trebleOuterRadius,
    BOARD.doubleInnerRadius,
    BOARD.doubleOuterRadius,
  ];
  if (wireRadii.some((w) => Math.abs(r - w) < 0.5)) return WIRE;
  const degrees = (Math.atan2(p.y, p.x) * 180) / Math.PI;
  if (r > BOARD.outerBullRadius) {
    // Distance to the nearest sector wire, which sit at 9° + 18° k.
    const off = ((((degrees - 9) % 18) + 18) % 18);
    const nearest = Math.min(off, 18 - off);
    if (r * Math.sin((nearest * Math.PI) / 180) < 0.5) return WIRE;
  }

  if (r <= BOARD.bullRadius) return RED;
  if (r <= BOARD.outerBullRadius) return GREEN;
  const index = SECTORS.indexOf(sectorAtAngle(degrees) as (typeof SECTORS)[number]);
  const dark = index % 2 === 0; // the 20 is black, its beds red
  const inTreble = r >= BOARD.trebleInnerRadius && r <= BOARD.trebleOuterRadius;
  const inDouble = r >= BOARD.doubleInnerRadius;
  if (inTreble || inDouble) return dark ? RED : GREEN;
  return dark ? BLACK : CREAM;
}

export function renderBoard(board: SyntheticBoard): RgbaImage {
  const { width, height } = board;
  const toBoard = invertHomography(board.toImage)!;
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 12345;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sum = [0, 0, 0];
      for (const [sx, sy] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]] as const) {
        const colour = paint(applyHomography(toBoard, { x: x + sx, y: y + sy }), board);
        for (let c = 0; c < 3; c += 1) sum[c]! += colour[c]!;
      }
      const light = board.light?.(x, y) ?? 1;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) data[i + c] = (sum[c]! / 4) * light + (board.noise ? board.noise * noise() : 0);
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/** Face on, 1.6 px a millimetre, in a 640×640 picture. */
export const FACE_ON: Matrix3 = [1.6, 0, 320, 0, -1.6, 320, 0, 0, 1];

/** Face on but turned `degrees` anticlockwise, as a phone not quite level. */
export function rolled(degrees: number): Matrix3 {
  const t = (degrees * Math.PI) / 180;
  const c = 1.6 * Math.cos(t);
  const s = 1.6 * Math.sin(t);
  // Image y is down: a board point (x, y) goes to (c x − s y, −(s x + c y)).
  return [c, -s, 320, -s, -c, 320, 0, 0, 1];
}

/**
 * The user's camera, from one of their real calibrations: low and to the
 * left, the board foreshortened to two thirds across, in a 720×1280 picture.
 */
export const STEEP: Matrix3 = [
  0.667285131903105, -0.09945047067307505, 281.5465392409956, -0.1085159895998512, -1.41503320506268, 620.7361767837278,
  -0.0006639778939008411, -0.0005257942324589655, 1,
];
