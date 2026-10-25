/**
 * Where the bull-off view looks (BullView.vue): the part of the board that
 * holds the bull and every dart thrown for it, as large as the view allows.
 * Each new dart moves the frame, so the board zooms in on the first and then
 * pans to keep them all in the middle.
 */

import type { Point } from '@treblewise/core';

import { R } from '../dartboardGeometry.js';

/** What the view shows: its middle, in board millimetres, and how many pixels a millimetre is. */
export interface Frame {
  x: number;
  y: number;
  scale: number;
}

export interface FrameOptions {
  /** The least half-width shown, in millimetres: the outer bull and some board round it. */
  closest?: number;
  /** How much room is left round the darts, as a share of what they span. */
  room?: number;
  /** And in millimetres. */
  margin?: number;
  /** Pixels kept clear at every edge of the view, for a dart's badge and label. */
  inset?: number;
}

/** Before any dart: the bull and the singles round it, enough to tap the first dart in. */
export const OPENING_HALF = 75;
/** The whole board, for a dart that landed outside the frame. */
export const WHOLE_HALF = R + 4;

/** A frame centred on the bull, showing `half` millimetres either side in the narrower direction. */
export function frameAround(half: number, view: { width: number; height: number }): Frame {
  return { x: 0, y: 0, scale: Math.min(view.width, view.height) / (2 * half) };
}

/**
 * The frame that fits the bull and `darts` into a view `width` × `height`
 * pixels: centred on the middle of them all, as close as `closest` lets it.
 * With no darts, the opening frame.
 */
export function bullFrame(darts: readonly Point[], view: { width: number; height: number }, options: FrameOptions = {}): Frame {
  const { closest = 20, room = 1.15, margin = 4, inset = 0 } = options;
  if (darts.length === 0 || view.width <= 0 || view.height <= 0) return frameAround(OPENING_HALF, view);
  const width = Math.max(view.width - 2 * inset, view.width / 2);
  const height = Math.max(view.height - 2 * inset, view.height / 2);
  const xs = [0, ...darts.map((dart) => dart.x)];
  const ys = [0, ...darts.map((dart) => dart.y)];
  const [left, right] = [Math.min(...xs), Math.max(...xs)];
  const [bottom, top] = [Math.min(...ys), Math.max(...ys)];
  const halfX = Math.min(WHOLE_HALF, Math.max(closest, ((right - left) / 2) * room + margin));
  const halfY = Math.min(WHOLE_HALF, Math.max(closest, ((top - bottom) / 2) * room + margin));
  return {
    x: (left + right) / 2,
    y: (bottom + top) / 2,
    scale: Math.min(width / (2 * halfX), height / (2 * halfY)),
  };
}

/**
 * Part of the way from one frame to another, `t` from 0 to 1. The scale
 * moves evenly in proportion rather than in pixels, so a zoom reads as one
 * steady movement, not a lurch at the start.
 */
export function between(from: Frame, to: Frame, t: number): Frame {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    scale: from.scale * Math.pow(to.scale / from.scale, t),
  };
}

/** A point on the board, in the view's pixels. */
export function toView(point: Point, frame: Frame, view: { width: number; height: number }): { x: number; y: number } {
  return {
    x: view.width / 2 + (point.x - frame.x) * frame.scale,
    y: view.height / 2 - (point.y - frame.y) * frame.scale,
  };
}

/** A point in the view's pixels, on the board. */
export function fromView(point: { x: number; y: number }, frame: Frame, view: { width: number; height: number }): Point {
  return {
    x: frame.x + (point.x - view.width / 2) / frame.scale,
    y: frame.y - (point.y - view.height / 2) / frame.scale,
  };
}
