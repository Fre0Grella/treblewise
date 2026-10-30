/**
 * The rough board, from nothing: where the bull is, the double ring around
 * it, how the board is tilted towards the camera, and which way the 20 is.
 * The result is a homography a few millimetres out, which `refine` makes exact.
 */

import { BOARD } from '../../board/geometry.js';
import { applyHomography, invertHomography, multiply3, type Matrix3 } from '../homography.js';
import { conicOf, ransacEllipse, type Ellipse, type XY } from './raster/ellipse.js';
import { blur3, close, components, field, hueMask, inMask, sample, union, type Field, type Mask, type RgbaImage } from './raster/masks.js';

const HALF_WIRE = BOARD.doubleEdgeRadius - BOARD.doubleOuterRadius;

/** The coloured beds, inside their wires, in board millimetres. */
export const BEDS = {
  trebleInner: BOARD.trebleInnerRadius + HALF_WIRE,
  trebleOuter: BOARD.trebleOuterRadius - HALF_WIRE,
  doubleInner: BOARD.doubleInnerRadius + HALF_WIRE,
  doubleOuter: BOARD.doubleOuterRadius - HALF_WIRE,
} as const;

/** The double bed's outside over the treble bed's, along any ray from the bull. */
const RING_RATIO = BEDS.doubleOuter / BEDS.trebleOuter;

/** What the board finder looks at: where the red and the green are. */
export interface BoardMaps {
  readonly width: number;
  readonly height: number;
  /** Red or green, gaps of a few pixels closed: the rings as unbroken as they can be. */
  readonly closed: Mask;
  readonly red: Mask;
  /** Red or green, blurred: 1 in a bed, 0 off it, for finding a bed's edges. */
  readonly colour: Field;
  /** Red minus green, blurred: +1 on red, −1 on green, for finding the wires between them. */
  readonly redGreen: Field;
}

const COLOURFUL = { minSaturation: 0.35, minValue: 0.2 };

export function boardMaps(image: RgbaImage): BoardMaps {
  const { width, height } = image;
  const red = hueMask(image, { from: 330, to: 20 }, COLOURFUL);
  const green = hueMask(image, { from: 80, to: 190 }, COLOURFUL);
  const either = union(red, green);
  return {
    width,
    height,
    closed: close(either, 2),
    red,
    colour: blur3(field(width, height, [either, 1])),
    redGreen: blur3(field(width, height, [red, 1], [green, -1])),
  };
}

/** Runs of `true` along a ray, as [first, last] distances in pixels. */
function runsAlong(mask: Mask, from: XY, angle: number): Array<[number, number]> {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const runs: Array<[number, number]> = [];
  const longest = Math.hypot(mask.width, mask.height);
  let start = -1;
  for (let r = 0; r < longest; r += 1) {
    const x = from.x + r * dx;
    const y = from.y + r * dy;
    if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) break;
    const on = inMask(mask, x, y);
    if (on && start < 0) start = r;
    if (!on && start >= 0) {
      runs.push([start, r - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, Math.floor(longest)]);
  return runs;
}

/**
 * Where rays from a bull candidate leave the double bed: on each ray, the two
 * coloured runs whose outer ends come closest to the double-to-treble ratio,
 * within 20 % (perspective stretches it). A dart or a pale patch spoils a
 * ray or two, never the ring, which is why this works where a closed ring
 * would not.
 */
function doubleHits(maps: BoardMaps, centre: XY, rays: number): XY[] {
  const hits: XY[] = [];
  for (let k = 0; k < rays; k += 1) {
    const angle = (2 * Math.PI * k) / rays;
    const runs = runsAlong(maps.closed, centre, angle).filter(([first]) => first > 0); // not the bull's own
    let best: { err: number; end: number } | null = null;
    for (let i = 0; i < runs.length; i += 1) {
      for (let j = i + 1; j < runs.length; j += 1) {
        const err = Math.abs(runs[j]![1] / Math.max(1, runs[i]![1]) / RING_RATIO - 1);
        if (err < 0.2 && (!best || err < best.err)) best = { err, end: runs[j]![1] };
      }
    }
    if (best) hits.push({ x: centre.x + best.end * Math.cos(angle), y: centre.y + best.end * Math.sin(angle) });
  }
  return hits;
}

/** Small, compact, filled blobs: what a bull looks like, among much else. */
function bullCandidates(maps: BoardMaps): XY[] {
  const most = 0.01 * maps.width * maps.height;
  return components(maps.closed)
    .filter((c) => {
      const w = c.maxX - c.minX + 1;
      const h = c.maxY - c.minY + 1;
      return c.area >= 30 && c.area <= most && w / h > 1 / 3 && w / h < 3 && c.area >= 0.5 * w * h;
    })
    .map((c) => ({ x: c.x, y: c.y }));
}

export interface Bull {
  readonly centre: XY;
  /** The double bed's outside edge, as an ellipse in the image. */
  readonly ring: Ellipse;
}

/** The bull candidate with the most rays finding a double ring around it. */
export function findBull(maps: BoardMaps): XY | null {
  let best: { score: number; centre: XY } | null = null;
  for (const centre of bullCandidates(maps)) {
    const hits = doubleHits(maps, centre, 90);
    if (hits.length < 30) continue;
    const fit = ransacEllipse(hits);
    if (!fit) continue;
    const score = hits.length * fit.inliers;
    if (!best || score > best.score) best = { score, centre };
  }
  return best?.centre ?? null;
}

/** The double ring around the bull, from a ray every degree. */
export function fitRing(maps: BoardMaps, centre: XY): Ellipse | null {
  return ransacEllipse(doubleHits(maps, centre, 360))?.ellipse ?? null;
}

const transpose = (m: Matrix3): Matrix3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/**
 * Board → image, for every turn of the board about the bull.
 *
 * The image of a circle and the image of its centre give the board's
 * vanishing line: the polar of the centre with respect to the ellipse. Sending
 * that line back to infinity leaves an ellipse centred on the bull, and an
 * affine map makes that the 169 mm circle. Only the turn is left open. The
 * ellipse alone would not do: seen at an angle the near half of the board is
 * bigger, the bull is off the ellipse's centre, and the sectors fan out wrong.
 */
export function tiltedBoard(bull: Bull): ((turn: number) => Matrix3) | null {
  const C = conicOf(bull.ring) as unknown as Matrix3;
  const { x, y } = bull.centre;
  const line = [C[0] * x + C[1] * y + C[2], C[3] * x + C[4] * y + C[5], C[6] * x + C[7] * y + C[8]];
  if (!(Math.abs(line[2]!) > 1e-12)) return null;
  const toAffine: Matrix3 = [1, 0, 0, 0, 1, 0, line[0]! / line[2]!, line[1]! / line[2]!, 1];
  const fromAffine = invertHomography(toAffine);
  if (!fromAffine) return null;
  const centre = applyHomography(toAffine, bull.centre);

  // The conic in the affine picture, moved to be centred on the bull.
  const shift: Matrix3 = [1, 0, centre.x, 0, 1, centre.y, 0, 0, 1];
  const moved = multiply3(transpose(shift), multiply3(transpose(fromAffine), multiply3(C, multiply3(fromAffine, shift))));
  const k = -moved[8];
  if (!(k !== 0 && Number.isFinite(k))) return null;
  // (p − c)ᵀ M (p − c) = 1, and the affine map is M^(−1/2), symmetric.
  const m00 = moved[0] / k;
  const m01 = moved[1] / k;
  const m11 = moved[4] / k;
  const mean = (m00 + m11) / 2;
  const half = Math.hypot((m00 - m11) / 2, m01);
  const l1 = mean - half;
  const l2 = mean + half;
  if (!(l1 > 0 && l2 > 0)) return null;
  const angle = 0.5 * Math.atan2(2 * m01, m00 - m11);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const r1 = 1 / Math.sqrt(l2); // along `angle`: the larger eigenvalue's axis
  const r2 = 1 / Math.sqrt(l1);
  const scale = 1 / BEDS.doubleOuter;
  const a00 = (c * c * r1 + s * s * r2) * scale;
  const a01 = c * s * (r1 - r2) * scale;
  const a11 = (s * s * r1 + c * c * r2) * scale;

  return (turn) => {
    const ct = Math.cos(turn);
    const st = Math.sin(turn);
    // Board y is up and image y is down: flip, turn, then the affine map.
    const b00 = ct;
    const b01 = st;
    const b10 = st;
    const b11 = -ct;
    const affine: Matrix3 = [
      a00 * b00 + a01 * b10, a00 * b01 + a01 * b11, centre.x,
      a01 * b00 + a11 * b10, a01 * b01 + a11 * b11, centre.y,
      0, 0, 1,
    ];
    const h = multiply3(fromAffine, affine);
    return h.map((v) => v / h[8]) as unknown as Matrix3;
  };
}

/** +1 where the board's beds are red, −1 where green: the 20's are red, and they alternate. */
function bedColour(degrees: number): number {
  const k = ((Math.round((90 - degrees) / 18) % 20) + 20) % 20;
  return k % 2 === 0 ? 1 : -1;
}

/**
 * Which way round the board is. Red-minus-green around the beds is matched
 * against the board's pattern at every half degree. The pattern repeats every
 * 36°, so of the turns that match, the one with the 20 nearest the top of the
 * picture is taken: boards hang with the 20 up.
 */
export function chooseTurn(maps: BoardMaps, boardAt: (turn: number) => Matrix3): Matrix3 {
  const step = 0.5;
  const angles = Array.from({ length: 360 / step }, (_, i) => i * step);
  const radii = [(BEDS.doubleInner + BEDS.doubleOuter) / 2, (BEDS.trebleInner + BEDS.trebleOuter) / 2];
  const rows = angles.map((turnDegrees) => {
    const h = boardAt((turnDegrees * Math.PI) / 180);
    let score = 0;
    for (const degrees of angles) {
      const rad = (degrees * Math.PI) / 180;
      for (const r of radii) {
        const p = applyHomography(h, { x: r * Math.cos(rad), y: r * Math.sin(rad) });
        const v = sample(maps.redGreen, p.x, p.y);
        if (Number.isFinite(v)) score += v * bedColour(degrees);
      }
    }
    const centre = applyHomography(h, { x: 0, y: 0 });
    const top = applyHomography(h, { x: 0, y: 100 });
    const upright = -(top.y - centre.y) / Math.hypot(top.x - centre.x, top.y - centre.y);
    return { score, upright, h };
  });
  const most = Math.max(...rows.map((r) => r.score));
  const peaks = rows.filter((row, i) => {
    const before = rows[(i - 1 + rows.length) % rows.length]!;
    const after = rows[(i + 1) % rows.length]!;
    return row.score > 0.7 * most && row.score >= before.score && row.score >= after.score;
  });
  return peaks.reduce((best, row) => (row.upright > best.upright ? row : best)).h;
}

export type LocateStep = 'bull' | 'ring' | 'tilt' | 'turn';

/** The rough board, or why it could not be found. */
export function locate(
  maps: BoardMaps,
  onStep: (step: LocateStep) => void = () => {},
): { toImage: Matrix3 } | { notFound: 'noBull' | 'noRing' } {
  onStep('bull');
  const centre = findBull(maps);
  if (!centre) return { notFound: 'noBull' };
  onStep('ring');
  const ring = fitRing(maps, centre);
  if (!ring) return { notFound: 'noRing' };
  onStep('tilt');
  const boardAt = tiltedBoard({ centre, ring });
  if (!boardAt) return { notFound: 'noRing' };
  onStep('turn');
  return { toImage: chooseTurn(maps, boardAt) };
}
