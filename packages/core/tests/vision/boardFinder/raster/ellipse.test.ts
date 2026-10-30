import { describe, expect, it } from 'vitest';

import {
  conicOf,
  ellipseOfConic,
  fitEllipse,
  radiusOn,
  ransacEllipse,
  type Ellipse,
  type XY,
} from '../../../../src/vision/boardFinder/raster/ellipse.js';

function around(e: Ellipse, n: number, from = 0, to = 2 * Math.PI): XY[] {
  const c = Math.cos(e.angle);
  const s = Math.sin(e.angle);
  return Array.from({ length: n }, (_, i) => {
    const t = from + ((to - from) * i) / n;
    const u = e.a * Math.cos(t);
    const v = e.b * Math.sin(t);
    return { x: e.cx + u * c - v * s, y: e.cy + u * s + v * c };
  });
}

/** The same ellipse, whichever way round its axes and angle are written. */
function expectSame(got: Ellipse | null, want: Ellipse, digits = 6) {
  expect(got).not.toBeNull();
  expect(got!.cx).toBeCloseTo(want.cx, digits);
  expect(got!.cy).toBeCloseTo(want.cy, digits);
  expect(got!.a).toBeCloseTo(want.a, digits);
  expect(got!.b).toBeCloseTo(want.b, digits);
  const turn = (((got!.angle - want.angle) % Math.PI) + Math.PI) % Math.PI;
  expect(Math.min(turn, Math.PI - turn)).toBeLessThan(10 ** -(digits - 2));
}

/** Like the double ring of the user's camera: tall, narrow and tilted, in a 720×1280 photo. */
const STEEP: Ellipse = { cx: 344.7, cy: 572.3, a: 198.4, b: 142.3, angle: (71.2 * Math.PI) / 180 };

describe('fitEllipse', () => {
  it('recovers an exact ellipse from points on it', () => {
    expectSame(fitEllipse(around(STEEP, 40)), STEEP);
    expectSame(fitEllipse(around({ cx: 0, cy: 0, a: 5, b: 5, angle: 0 }, 12)), { cx: 0, cy: 0, a: 5, b: 5, angle: 0 });
  });

  it('recovers it from an arc alone, as when part of the ring is hidden', () => {
    expectSame(fitEllipse(around(STEEP, 30, 0.3, 3.5)), STEEP, 4);
  });

  it('stays close on noisy points', () => {
    let seed = 7;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2; // ±1 px
    const fit = fitEllipse(around(STEEP, 200).map((p) => ({ x: p.x + noise(), y: p.y + noise() })));
    expect(Math.abs(fit!.cx - STEEP.cx)).toBeLessThan(0.3);
    expect(Math.abs(fit!.cy - STEEP.cy)).toBeLessThan(0.3);
    expect(Math.abs(fit!.a - STEEP.a)).toBeLessThan(0.5);
    expect(Math.abs(fit!.b - STEEP.b)).toBeLessThan(0.5);
  });

  it('refuses fewer than five points and points on a line', () => {
    expect(fitEllipse(around(STEEP, 4))).toBeNull();
    expect(fitEllipse(Array.from({ length: 10 }, (_, i) => ({ x: i, y: 2 * i })))).toBeNull();
  });
});

describe('conicOf and ellipseOfConic', () => {
  it('are inverse, and the conic is zero on the ellipse, negative inside', () => {
    const C = conicOf(STEEP);
    for (const p of around(STEEP, 8)) {
      const v = [p.x, p.y, 1];
      const q = [0, 1, 2].reduce((sum, i) => sum + v[i]! * [0, 1, 2].reduce((t, j) => t + C[i * 3 + j]! * v[j]!, 0), 0);
      expect(Math.abs(q)).toBeLessThan(1e-9);
    }
    expect(C[8]! + 0).toBeDefined();
    const inside = [STEEP.cx, STEEP.cy, 1];
    const q = [0, 1, 2].reduce((sum, i) => sum + inside[i]! * [0, 1, 2].reduce((t, j) => t + C[i * 3 + j]! * inside[j]!, 0), 0);
    expect(q).toBeLessThan(0);

    const [A, B2, D2, , Cc, E2, , , F] = C;
    expectSame(ellipseOfConic([A!, 2 * B2!, Cc!, 2 * D2!, 2 * E2!, F!]), STEEP);
  });

  it('says a hyperbola is not an ellipse', () => {
    expect(ellipseOfConic([1, 0, -1, 0, 0, -1])).toBeNull();
  });
});

describe('radiusOn', () => {
  it('is 1 on the ellipse and 0 at its centre', () => {
    for (const p of around(STEEP, 6)) expect(radiusOn(STEEP, p)).toBeCloseTo(1, 9);
    expect(radiusOn(STEEP, { x: STEEP.cx, y: STEEP.cy })).toBe(0);
  });
});

describe('ransacEllipse', () => {
  it('ignores a third of the points being somewhere else entirely', () => {
    const good = around(STEEP, 120);
    const bad = Array.from({ length: 60 }, (_, i) => ({ x: 50 + ((i * 37) % 600), y: 100 + ((i * 91) % 1000) }));
    const found = ransacEllipse([...good, ...bad]);
    expectSame(found!.ellipse, STEEP, 3);
    expect(found!.inliers).toBeGreaterThan(0.6);
    expect(found!.inliers).toBeLessThan(0.75);
  });

  it('gives up on too few points', () => {
    expect(ransacEllipse(around(STEEP, 8))).toBeNull();
  });
});
