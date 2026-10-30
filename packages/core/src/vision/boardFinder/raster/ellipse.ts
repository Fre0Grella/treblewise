/**
 * Ellipses: fitting one to points, robustly, and writing it as a conic.
 *
 * The fit is Fitzgibbon's direct least squares, in Halír and Flusser's
 * numerically stable form: it always returns an ellipse (never a hyperbola),
 * and it reduces to a 3×3 eigenproblem, small enough to solve by hand here.
 */

export interface XY {
  readonly x: number;
  readonly y: number;
}

export interface Ellipse {
  readonly cx: number;
  readonly cy: number;
  /** Semi-axis along `angle`. */
  readonly a: number;
  /** Semi-axis across it. */
  readonly b: number;
  /** Radians, from +x towards +y. */
  readonly angle: number;
}

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

const det3 = (m: Mat3) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

function inverse3(m: Mat3): Mat3 | null {
  const d = det3(m);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-300) return null;
  const c = (r0: number, c0: number, r1: number, c1: number) => m[r0]![c0]! * m[r1]![c1]! - m[r0]![c1]! * m[r1]![c0]!;
  return [
    [c(1, 1, 2, 2) / d, -c(0, 1, 2, 2) / d, c(0, 1, 1, 2) / d],
    [-c(1, 0, 2, 2) / d, c(0, 0, 2, 2) / d, -c(0, 0, 1, 2) / d],
    [c(1, 0, 2, 1) / d, -c(0, 0, 2, 1) / d, c(0, 0, 1, 1) / d],
  ];
}

const mul3 = (a: Mat3, b: Mat3): Mat3 =>
  [0, 1, 2].map((r) => [0, 1, 2].map((c) => a[r]![0]! * b[0]![c]! + a[r]![1]! * b[1]![c]! + a[r]![2]! * b[2]![c]!)) as Mat3;

const cross = (u: Vec3, v: Vec3): Vec3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

/** The real roots of x³ + a x² + b x + c. */
function cubicRoots(a: number, b: number, c: number): number[] {
  const q = (a * a - 3 * b) / 9;
  const r = (2 * a * a * a - 9 * a * b + 27 * c) / 54;
  if (r * r < q * q * q) {
    const t = Math.acos(Math.max(-1, Math.min(1, r / Math.sqrt(q * q * q))));
    const s = -2 * Math.sqrt(q);
    return [s * Math.cos(t / 3) - a / 3, s * Math.cos((t + 2 * Math.PI) / 3) - a / 3, s * Math.cos((t - 2 * Math.PI) / 3) - a / 3];
  }
  const big = -Math.sign(r) * Math.cbrt(Math.abs(r) + Math.sqrt(r * r - q * q * q));
  const small = big === 0 ? 0 : q / big;
  return [big + small - a / 3];
}

/** Eigenvectors of a 3×3 matrix for its real eigenvalues. */
function eigenvectors3(m: Mat3): Vec3[] {
  const trace = m[0][0] + m[1][1] + m[2][2];
  const minors = m[0][0] * m[1][1] - m[0][1] * m[1][0] + m[0][0] * m[2][2] - m[0][2] * m[2][0] + m[1][1] * m[2][2] - m[1][2] * m[2][1];
  const out: Vec3[] = [];
  for (const lambda of cubicRoots(-trace, minors, -det3(m))) {
    const rows = m.map((row, i) => row.map((v, j) => v - (i === j ? lambda : 0))) as Mat3;
    // The eigenvector is orthogonal to every row of (M − λI): the longest
    // cross product of two of them is the best-conditioned estimate.
    const candidates = [cross(rows[0], rows[1]), cross(rows[0], rows[2]), cross(rows[1], rows[2])];
    const best = candidates.reduce((p, v) => (Math.hypot(...v) > Math.hypot(...p) ? v : p));
    const n = Math.hypot(...best);
    if (n > 0) out.push([best[0] / n, best[1] / n, best[2] / n]);
  }
  return out;
}

/** The ellipse A x² + B xy + C y² + D x + E y + F = 0 describes, or null when it is not one. */
export function ellipseOfConic([A, B, C, D, E, F]: readonly number[]): Ellipse | null {
  const det = 4 * A! * C! - B! * B!;
  if (!(det > 0)) return null;
  const cx = (B! * E! - 2 * C! * D!) / det;
  const cy = (B! * D! - 2 * A! * E!) / det;
  const f = A! * cx * cx + B! * cx * cy + C! * cy * cy + D! * cx + E! * cy + F!;
  // Eigen of the quadratic part [[A, B/2], [B/2, C]].
  const mean = (A! + C!) / 2;
  const half = Math.hypot((A! - C!) / 2, B! / 2);
  const l1 = mean - half;
  const l2 = mean + half;
  const angle = Math.abs(B!) < 1e-15 && A! <= C! ? 0 : Math.atan2(l1 - A!, B! / 2);
  const a2 = -f / l1;
  const b2 = -f / l2;
  if (!(a2 > 0 && b2 > 0)) return null;
  return { cx, cy, a: Math.sqrt(a2), b: Math.sqrt(b2), angle };
}

/** The ellipse closest to the points in the algebraic sense, or null with fewer than 5 or a degenerate set. */
export function fitEllipse(points: readonly XY[]): Ellipse | null {
  const n = points.length;
  if (n < 5) return null;
  // Centre and scale first: squares of raw pixel coordinates lose precision.
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;
  let spread = 0;
  for (const p of points) spread += Math.hypot(p.x - mx, p.y - my);
  const s = spread / n || 1;

  const S1: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const S2: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const S3: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of points) {
    const x = (p.x - mx) / s;
    const y = (p.y - my) / s;
    const d1: Vec3 = [x * x, x * y, y * y];
    const d2: Vec3 = [x, y, 1];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        S1[i]![j]! += d1[i]! * d1[j]!;
        S2[i]![j]! += d1[i]! * d2[j]!;
        S3[i]![j]! += d2[i]! * d2[j]!;
      }
    }
  }
  const S3inv = inverse3(S3);
  if (!S3inv) return null;
  const S2t = [0, 1, 2].map((r) => [0, 1, 2].map((c) => S2[c]![r]!)) as Mat3;
  const T = mul3(S3inv, S2t).map((row) => row.map((v) => -v)) as Mat3;
  const M = mul3(S2, T).map((row, i) => row.map((v, j) => v + S1[i]![j]!)) as Mat3;
  // Premultiply by the inverse of the constraint matrix 4ac − b² = 1.
  const K: Mat3 = [
    [M[2][0] / 2, M[2][1] / 2, M[2][2] / 2],
    [-M[1][0], -M[1][1], -M[1][2]],
    [M[0][0] / 2, M[0][1] / 2, M[0][2] / 2],
  ];
  const a1 = eigenvectors3(K).find((v) => 4 * v[0] * v[2] - v[1] * v[1] > 0);
  if (!a1) return null;
  const a2 = T.map((row) => row[0]! * a1[0] + row[1]! * a1[1] + row[2]! * a1[2]);
  const local = ellipseOfConic([...a1, ...a2]);
  if (!local) return null;
  return { cx: local.cx * s + mx, cy: local.cy * s + my, a: local.a * s, b: local.b * s, angle: local.angle };
}

/**
 * How far out a point is, as a multiple of the ellipse's size in its
 * direction: 1 on the ellipse, 0 at its centre.
 */
export function radiusOn(e: Ellipse, p: XY): number {
  const dx = p.x - e.cx;
  const dy = p.y - e.cy;
  const c = Math.cos(e.angle);
  const s = Math.sin(e.angle);
  return Math.hypot((dx * c + dy * s) / e.a, (-dx * s + dy * c) / e.b);
}

/**
 * The ellipse as the symmetric matrix C of its conic, row-major, so that
 * [x y 1] C [x y 1]ᵀ = 0 on it, negative inside and positive outside.
 */
export function conicOf(e: Ellipse): number[] {
  const c = Math.cos(e.angle);
  const s = Math.sin(e.angle);
  const ia = 1 / (e.a * e.a);
  const ib = 1 / (e.b * e.b);
  const A = c * c * ia + s * s * ib;
  const B = 2 * c * s * (ia - ib);
  const C = s * s * ia + c * c * ib;
  const D = -2 * A * e.cx - B * e.cy;
  const E = -B * e.cx - 2 * C * e.cy;
  const F = A * e.cx * e.cx + B * e.cx * e.cy + C * e.cy * e.cy - 1;
  return [A, B / 2, D / 2, B / 2, C, E / 2, D / 2, E / 2, F];
}

/** A small seeded generator (mulberry32), so a fit is the same every time. */
function random(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RobustEllipse {
  readonly ellipse: Ellipse;
  /** The share of the points within the tolerance of it. */
  readonly inliers: number;
}

/**
 * RANSAC: fit ellipses through many random handfuls of six points, keep the
 * one most points agree with, then refit on those. A point agrees when its
 * `radiusOn` is within `tolerance` of 1.
 */
export function ransacEllipse(points: readonly XY[], options: { trials?: number; tolerance?: number } = {}): RobustEllipse | null {
  const trials = options.trials ?? 150;
  const tolerance = options.tolerance ?? 0.025;
  if (points.length < 10) return null;
  const next = random(1);
  const agreeing = (e: Ellipse) => points.filter((p) => Math.abs(radiusOn(e, p) - 1) < tolerance);

  let best: XY[] = [];
  for (let trial = 0; trial < trials; trial += 1) {
    const pick = new Set<number>();
    while (pick.size < 6) pick.add(Math.floor(next() * points.length));
    const e = fitEllipse([...pick].map((i) => points[i]!));
    if (!e || !(Math.min(e.a, e.b) > 1)) continue;
    const inliers = agreeing(e);
    if (inliers.length > best.length) best = inliers;
  }
  for (let round = 0; round < 2; round += 1) {
    if (best.length < 10) return null;
    const e = fitEllipse(best);
    if (!e) return null;
    best = agreeing(e);
  }
  if (best.length < 10) return null;
  const ellipse = fitEllipse(best);
  return ellipse ? { ellipse, inliers: best.length / points.length } : null;
}
