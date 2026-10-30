/**
 * Snapping a rough homography onto the wires.
 *
 * Under the current homography we know, to a few millimetres, where every bed
 * edge and every red-to-green wire should be in the picture, so we look there
 * and measure where it really is. A bed edge measured in the photo must lie on
 * its circle on the board, and a wire crossing on its sector line: the new
 * homography is the one that puts a few hundred of them closest to where they
 * belong. Measurements that disagree (a dart over an edge) are dropped, and the
 * whole thing is repeated from the better estimate.
 *
 * Fitting to the circles and lines, rather than to the board point on the ray
 * that was searched, matters: from a centre a few millimetres off, a ray finds
 * the edge where it crosses it, not where the ray was aimed, and pairing it
 * with the aimed point would carry the error into the next fit.
 */

import { sectorAtAngle, type Point } from '../../board/geometry.js';
import { applyHomography, invertHomography, multiply3, solveLinear, type Matrix3 } from '../homography.js';
import { BEDS, type BoardMaps } from './locate.js';
import { sample, type Field } from './raster/masks.js';

interface Measured {
  /** Where it was found in the photo. */
  image: Point;
  /** A bed edge lies on a circle of this radius; a wire crossing was searched for at it. */
  radius: number;
  /** A wire crossing lies on the sector line at this angle; a bed edge was searched for along it. */
  degrees: number;
  kind: 'ring' | 'wire';
}

const toRad = (degrees: number) => (degrees * Math.PI) / 180;
const polar = (r: number, degrees: number): Point => ({ x: r * Math.cos(toRad(degrees)), y: r * Math.sin(toRad(degrees)) });

function along(f: Field, h: Matrix3, points: Point[]): number[] {
  return points.map((p) => {
    const q = applyHomography(h, p);
    return sample(f, q.x, q.y);
  });
}

/**
 * The band around a profile's peak, at half its height: its two edges, by
 * linear interpolation between samples. Null when the profile is flat, leaves
 * the picture, or the band runs off either end.
 */
function bandEdges(profile: number[], at: number[]): [number, number] | null {
  if (!profile.every(Number.isFinite)) return null;
  const top = Math.max(...profile);
  const bottom = Math.min(...profile);
  if (top - bottom < 0.3) return null;
  const half = bottom + (top - bottom) / 2;
  const peak = profile.indexOf(top);
  let i = peak;
  while (i > 0 && profile[i - 1]! > half) i -= 1;
  let j = peak;
  while (j < profile.length - 1 && profile[j + 1]! > half) j += 1;
  if (i === 0 || j === profile.length - 1) return null;
  const cross = (a: number, b: number) => at[a]! + ((half - profile[a]!) / (profile[b]! - profile[a]!)) * (at[b]! - at[a]!);
  return [cross(i - 1, i), cross(j, j + 1)];
}

/** How far a bed edge or wire may be from where the current homography puts it, in millimetres. */
const REACH = 10;

/** The inside and outside edge of the treble and double beds, on three lines across each sector. */
function ringEdges(maps: BoardMaps, h: Matrix3): Measured[] {
  const out: Measured[] = [];
  const bands = [
    { inner: BEDS.trebleInner, outer: BEDS.trebleOuter },
    { inner: BEDS.doubleInner, outer: BEDS.doubleOuter },
  ];
  for (let k = 0; k < 20; k += 1) {
    for (const offset of [-6, -3, 0, 3, 6]) {
      const degrees = 90 - 18 * k + offset;
      for (const band of bands) {
        const radii: number[] = [];
        for (let r = band.inner - REACH - 2; r < band.outer + REACH + 2; r += 0.25) radii.push(r);
        const edges = bandEdges(along(maps.colour, h, radii.map((r) => polar(r, degrees))), radii);
        if (!edges || Math.abs(edges[0] - band.inner) > REACH || Math.abs(edges[1] - band.outer) > REACH) continue;
        // A believable band is about as wide as a bed.
        const width = edges[1] - edges[0];
        if (Math.abs(width - (band.outer - band.inner)) > 0.5 * (band.outer - band.inner)) continue;
        out.push({ image: applyHomography(h, polar(edges[0], degrees)), radius: band.inner, degrees, kind: 'ring' });
        out.push({ image: applyHomography(h, polar(edges[1], degrees)), radius: band.outer, degrees, kind: 'ring' });
      }
    }
  }
  return out;
}

/** Where red turns to green (or back) across each sector wire, on four arcs inside the beds. */
function wireCrossings(maps: BoardMaps, h: Matrix3): Measured[] {
  const out: Measured[] = [];
  const arcs = [BEDS.trebleInner + 2, BEDS.trebleOuter - 2, BEDS.doubleInner + 2, BEDS.doubleOuter - 2];
  for (let k = 0; k < 20; k += 1) {
    // The wire clockwise of sector k: sector k lies anticlockwise of it, at
    // larger angles, and its beds are red when k is even.
    const wire = 90 - 18 * k - 9;
    const sign = k % 2 === 0 ? 1 : -1;
    for (const r of arcs) {
      const angles: number[] = [];
      for (let d = wire - 8; d < wire + 8; d += 0.1) angles.push(d);
      const profile = along(maps.redGreen, h, angles.map((d) => polar(r, d))).map((v) => v * sign);
      if (!profile.every(Number.isFinite)) continue;
      const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
      if (mean(profile.slice(0, 10)) > -0.3 || mean(profile.slice(-10)) < 0.3) continue;
      const ups: number[] = [];
      for (let i = 0; i + 1 < profile.length; i += 1) if (profile[i]! < 0 && profile[i + 1]! >= 0) ups.push(i);
      if (ups.length !== 1) continue;
      const i = ups[0]!;
      const measured = angles[i]! + ((0 - profile[i]!) / (profile[i + 1]! - profile[i]!)) * (angles[i + 1]! - angles[i]!);
      out.push({ image: applyHomography(h, polar(r, measured)), radius: r, degrees: wire, kind: 'wire' });
    }
  }
  return out;
}

/** Signed distance, board millimetres, from where `toBoard` puts a measurement to its circle or line. */
function offCurve(toBoard: Matrix3, m: Measured): number {
  const b = applyHomography(toBoard, m.image);
  if (m.kind === 'ring') return Math.hypot(b.x, b.y) - m.radius;
  const a = toRad(m.degrees);
  return b.x * Math.sin(a) - b.y * Math.cos(a);
}

/**
 * The homography putting the measurements closest to their curves, by
 * Levenberg–Marquardt over its eight numbers, from `start`. Worked on in
 * normalised units (image about its centre, board in double-ring radii) so
 * that the eight numbers are of a size.
 */
function fitToCurves(measured: Measured[], start: Matrix3): Matrix3 | null {
  const n = measured.length;
  const cx = measured.reduce((s, m) => s + m.image.x, 0) / n;
  const cy = measured.reduce((s, m) => s + m.image.y, 0) / n;
  const spread = measured.reduce((s, m) => s + Math.hypot(m.image.x - cx, m.image.y - cy), 0) / n || 1;
  const fromNormal: Matrix3 = [spread, 0, cx, 0, spread, cy, 0, 0, 1];
  const toNormal = invertHomography(fromNormal)!;
  const unit = BEDS.doubleOuter;
  const toUnit: Matrix3 = [1 / unit, 0, 0, 0, 1 / unit, 0, 0, 0, 1];
  const fromUnit: Matrix3 = [unit, 0, 0, 0, unit, 0, 0, 0, 1];

  const back = invertHomography(start);
  if (!back) return null;
  const g0 = multiply3(toUnit, multiply3(back, fromNormal));
  let params = g0.slice(0, 8).map((v) => v / g0[8]);

  const toBoardOf = (p: number[]) => multiply3(fromUnit, multiply3([...p, 1] as unknown as Matrix3, toNormal));
  const residualsOf = (p: number[]) => {
    const g = toBoardOf(p);
    return measured.map((m) => offCurve(g, m));
  };
  const cost = (r: number[]) => r.reduce((s, v) => s + v * v, 0);

  let r = residualsOf(params);
  let lambda = 1e-3;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const step = 1e-6;
    const jacobian = params.map((_, j) => {
      const nudged = [...params];
      nudged[j]! += step;
      return residualsOf(nudged).map((v, i) => (v - r[i]!) / step);
    });
    const jtj = jacobian.map((a) => jacobian.map((b) => a.reduce((s, v, i) => s + v * b[i]!, 0)));
    const jtr = jacobian.map((a) => a.reduce((s, v, i) => s + v * r[i]!, 0));
    let improved = false;
    for (let attempt = 0; attempt < 8 && !improved; attempt += 1) {
      const damped = jtj.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) : v)));
      const delta = solveLinear(damped, jtr.map((v) => -v));
      if (!delta) {
        lambda *= 10;
        continue;
      }
      const next = params.map((v, i) => v + delta[i]!);
      const rNext = residualsOf(next);
      if (rNext.every(Number.isFinite) && cost(rNext) < cost(r)) {
        const gain = cost(r) - cost(rNext);
        params = next;
        r = rNext;
        lambda = Math.max(1e-9, lambda / 3);
        improved = true;
        if (gain < 1e-10 * (1 + cost(r))) iteration = Infinity;
      } else {
        lambda *= 10;
      }
    }
    if (!improved) break;
  }

  const h = invertHomography(toBoardOf(params));
  if (!h || !h.every(Number.isFinite)) return null;
  return h.map((v) => v / h[8]) as unknown as Matrix3;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? Number.NaN : sorted[Math.floor(sorted.length / 2)]!;
};

/** How far each measurement is from its curve under the homography, in board millimetres. */
function residuals(h: Matrix3, measured: Measured[]): number[] {
  const back = invertHomography(h);
  if (!back) return measured.map(() => Number.POSITIVE_INFINITY);
  return measured.map((m) => Math.abs(offCurve(back, m)));
}

export interface Refined {
  readonly toImage: Matrix3;
  readonly ringFeatures: number;
  readonly wireFeatures: number;
  /** Distances of every measurement from its circle or line, board millimetres. */
  readonly medianMm: number;
  readonly p90Mm: number;
  /** The median distance in each sector of the measurements agreeing with the fit, by sector number (index 0 unused), NaN where there are none. */
  readonly sectorMedianMm: readonly number[];
}

/** The homography snapped onto the wires, or null when too little could be measured. */
export function refine(maps: BoardMaps, start: Matrix3, rounds = 4): Refined | null {
  let h = start;
  for (let round = 0; round < rounds; round += 1) {
    const measured = [...ringEdges(maps, h), ...wireCrossings(maps, h)];
    if (measured.length < 20) return null;
    let kept = measured;
    for (let pass = 0; pass < 3; pass += 1) {
      const fitted = fitToCurves(kept, h);
      if (!fitted) return null;
      h = fitted;
      const r = residuals(h, measured);
      const limit = Math.max(0.75, 3 * median(residuals(h, kept)));
      kept = measured.filter((_, i) => r[i]! < limit);
      if (kept.length < 20) return null;
    }
  }

  const measured = [...ringEdges(maps, h), ...wireCrossings(maps, h)];
  const r = residuals(h, measured);
  const sorted = [...r].sort((a, b) => a - b);
  // Per sector, only what agrees with the fit: a dart over an edge is not a
  // wrong calibration, but a whole area sitting off its wires is.
  const limit = Math.max(0.75, 3 * median(r));
  const bySector: number[][] = Array.from({ length: 21 }, () => []);
  measured.forEach((m, i) => {
    if (r[i]! < limit) bySector[sectorAtAngle(m.degrees + 1e-6)]!.push(r[i]!);
  });
  return {
    toImage: h,
    ringFeatures: measured.filter((m) => m.kind === 'ring').length,
    wireFeatures: measured.filter((m) => m.kind === 'wire').length,
    medianMm: median(r),
    p90Mm: sorted[Math.floor(0.9 * (sorted.length - 1))] ?? Number.NaN,
    sectorMedianMm: bySector.map(median),
  };
}
