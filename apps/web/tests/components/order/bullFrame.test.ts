import { describe, expect, it } from 'vitest';

import { OPENING_HALF, WHOLE_HALF, between, bullFrame, fromView, toView } from '@/components/order/bullFrame.js';

const view = { width: 800, height: 600 };

describe('where the bull-off view looks', () => {
  it('opens on the bull and the singles round it', () => {
    expect(bullFrame([], view)).toEqual({ x: 0, y: 0, scale: 600 / (2 * OPENING_HALF) });
  });

  it('zooms in on the first dart, keeping the bull in the picture', () => {
    const frame = bullFrame([{ x: 0, y: 40 }], view);
    expect(frame.x).toBe(0);
    expect(frame.y).toBe(20);
    expect(frame.scale).toBeGreaterThan(600 / (2 * OPENING_HALF));
    for (const point of [{ x: 0, y: 0 }, { x: 0, y: 40 }]) {
      const at = toView(point, frame, view);
      expect(at.y).toBeGreaterThan(0);
      expect(at.y).toBeLessThan(view.height);
    }
  });

  it('moves to the middle of every dart as more come in', () => {
    const frame = bullFrame([{ x: 30, y: 10 }, { x: -10, y: -20 }], view);
    expect(frame.x).toBe(10);
    expect(frame.y).toBe(-5);
  });

  it('comes no closer than the outer bull with some board round it', () => {
    expect(bullFrame([{ x: 1, y: 1 }], view, { closest: 28 }).scale).toBe(600 / 56);
  });

  it('keeps clear of the edges by the inset, for the marks drawn on top', () => {
    expect(bullFrame([{ x: 1, y: 1 }], view, { closest: 28, inset: 50 }).scale).toBe(500 / 56);
  });

  it('goes no wider than the whole board, however far the dart', () => {
    expect(bullFrame([{ x: 400, y: 0 }], view).scale).toBeCloseTo(800 / (2 * WHOLE_HALF));
  });

  it('turns a point in the view back into the same point on the board', () => {
    const frame = { x: 12, y: -7, scale: 5.5 };
    const back = fromView(toView({ x: 31, y: 18 }, frame, view), frame, view);
    expect(back.x).toBeCloseTo(31);
    expect(back.y).toBeCloseTo(18);
  });

  it('zooms evenly in proportion between two frames', () => {
    const half = between({ x: 0, y: 0, scale: 2 }, { x: 10, y: 20, scale: 8 }, 0.5);
    expect(half).toEqual({ x: 5, y: 10, scale: 4 });
  });
});
