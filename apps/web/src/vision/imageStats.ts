/**
 * What the picture itself looks like: bright enough, sharp enough, and still
 * the same view it was calibrated for.
 *
 * The geometry half of the setup coach lives in `@treblewise/core` (where the board
 * is, which way to move). This half is about the pixels, and runs on the same
 * 64×64 greyscale crop of the board that the capture trigger uses.
 *
 * The thresholds are starting points. Every number is returned as well as
 * judged, and the app shows them, so a real session can correct them.
 */

export type ImageIssueCode = 'dark' | 'washedOut' | 'glare' | 'blurry' | 'moved';

/** A part of the board's area, as fractions of it (0–1), so it can be drawn over whatever shows the board. */
export interface Spot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageQuality {
  /** Mean brightness, 0–255. */
  brightness: number;
  /** Fraction of the board that is blown out, 0–1. */
  glare: number;
  /** Variance of the Laplacian: high on a board full of wires, low on mush. */
  sharpness: number;
  /** Fraction of blocks that differ from the calibration reference, 0–1. */
  drift: number;
  issues: ImageIssueCode[];
  /** Where the blown-out patches are: what a reflection warning points at. */
  glareSpots: Spot[];
  /** Which blocks differ from the calibration reference: what a "moved" warning points at. */
  changedSpots: Spot[];
}

export const IMAGE_THRESHOLDS = {
  dark: 45,
  washedOut: 215,
  glare: 0.04,
  sharpness: 25,
  drift: 0.35,
  blockDifference: 14,
  /** The capture trigger's own threshold for "something landed" (settle.ts). */
  emptyBlockDifference: 8,
};

function laplacianVariance(pixels: Uint8Array, width: number, height: number): number {
  let sum = 0;
  let sumSquares = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const value =
        4 * pixels[i]! - pixels[i - 1]! - pixels[i + 1]! - pixels[i - width]! - pixels[i + width]!;
      sum += value;
      sumSquares += value * value;
      count += 1;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

/**
 * How much of the view has changed since calibration, measured in blocks. One
 * dart moves a block or two; a knocked camera moves most of them, which is the
 * difference between "something landed" and "this calibration is now wrong".
 */
export function driftFraction(
  current: Uint8Array,
  reference: Uint8Array,
  width: number,
  height: number,
  blockSize = 8,
): number {
  const { changed, blocks } = changedBlocks(current, reference, width, height, blockSize);
  return blocks === 0 ? 0 : changed.length / blocks;
}

/** The blocks that differ from the reference by more than `blockDifference`, and how many there are in all. */
function changedBlocks(
  current: Uint8Array,
  reference: Uint8Array,
  width: number,
  height: number,
  blockSize = 8,
): { changed: Spot[]; blocks: number } {
  const changed: Spot[] = [];
  if (current.length !== reference.length || current.length !== width * height) return { changed, blocks: 0 };

  let blocks = 0;

  for (let by = 0; by < height; by += blockSize) {
    for (let bx = 0; bx < width; bx += blockSize) {
      let total = 0;
      let count = 0;
      for (let y = by; y < Math.min(by + blockSize, height); y += 1) {
        for (let x = bx; x < Math.min(bx + blockSize, width); x += 1) {
          const i = y * width + x;
          total += Math.abs(current[i]! - reference[i]!);
          count += 1;
        }
      }
      if (count === 0) continue;
      blocks += 1;
      if (total / count > IMAGE_THRESHOLDS.blockDifference) {
        changed.push({
          x: bx / width,
          y: by / height,
          width: (Math.min(bx + blockSize, width) - bx) / width,
          height: (Math.min(by + blockSize, height) - by) / height,
        });
      }
    }
  }

  return { changed, blocks };
}

/** A pixel this bright is blown out: no detail left to see a dart in. */
const BLOWN = 245;

/**
 * The patches that are mostly blown out, in cells of `cell` pixels: the
 * reflection itself, rather than every lone white pixel of a number ring.
 */
function blownSpots(pixels: Uint8Array, width: number, height: number, cell = 4): Spot[] {
  const spots: Spot[] = [];
  for (let cy = 0; cy < height; cy += cell) {
    for (let cx = 0; cx < width; cx += cell) {
      let blown = 0;
      let count = 0;
      for (let y = cy; y < Math.min(cy + cell, height); y += 1) {
        for (let x = cx; x < Math.min(cx + cell, width); x += 1) {
          if (pixels[y * width + x]! > BLOWN) blown += 1;
          count += 1;
        }
      }
      if (count > 0 && blown / count >= 0.5) {
        spots.push({
          x: cx / width,
          y: cy / height,
          width: (Math.min(cx + cell, width) - cx) / width,
          height: (Math.min(cy + cell, height) - cy) / height,
        });
      }
    }
  }
  return spots;
}

/** How far, in thumbnail pixels, a block may have moved and still be the same board. */
const EMPTY_SHIFT = 2;

/**
 * Whether the board looks as it did in `reference` (an empty board), with
 * nothing in it: no block of the thumbnail differs from the reference by as
 * much as the capture trigger counts as a dart landing.
 *
 * The overall brightness is taken out first: a room that got a little darker
 * moves every block the same way, while a dart moves one or two.
 *
 * Each block is also compared at small offsets, and its best match counts.
 * Pulling darts out turns or nudges the board on its bracket; a turn of a
 * degree or two moves every wire by a pixel or two in the thumbnail, and
 * compared pixel for pixel the empty board then looked changed everywhere, so
 * the darts were never seen to be out. A dart still in the board has nothing
 * in the empty board to line up with, so it still counts.
 *
 * The blocks overlap by half, as the capture trigger's do, so a dart on a
 * block boundary still fills most of one.
 */
export function boardLooksEmpty(
  current: Uint8Array,
  reference: Uint8Array,
  width: number,
  height: number,
  blockSize = 8,
): boolean {
  if (current.length !== reference.length || current.length !== width * height) return false;

  let shift = 0;
  for (let i = 0; i < current.length; i += 1) shift += current[i]! - reference[i]!;
  shift /= current.length;

  const step = Math.max(1, Math.floor(blockSize / 2));
  for (let by = 0; by + 1 < height; by += step) {
    for (let bx = 0; bx + 1 < width; bx += step) {
      let best = Infinity;
      for (let sy = -EMPTY_SHIFT; sy <= EMPTY_SHIFT; sy += 1) {
        for (let sx = -EMPTY_SHIFT; sx <= EMPTY_SHIFT; sx += 1) {
          let total = 0;
          let count = 0;
          for (let y = by; y < Math.min(by + blockSize, height); y += 1) {
            const ry = y + sy;
            if (ry < 0 || ry >= height) continue;
            for (let x = bx; x < Math.min(bx + blockSize, width); x += 1) {
              const rx = x + sx;
              if (rx < 0 || rx >= width) continue;
              total += Math.abs(current[y * width + x]! - reference[ry * width + rx]! - shift);
              count += 1;
            }
          }
          if (count > 0) best = Math.min(best, total / count);
        }
      }
      if (best >= IMAGE_THRESHOLDS.emptyBlockDifference) return false;
    }
  }
  return true;
}

export function assessImage(
  pixels: Uint8Array,
  width: number,
  height: number,
  reference?: Uint8Array | null,
): ImageQuality {
  let total = 0;
  let blown = 0;
  for (const value of pixels) {
    total += value;
    if (value > BLOWN) blown += 1;
  }

  const brightness = pixels.length === 0 ? 0 : total / pixels.length;
  const glare = pixels.length === 0 ? 0 : blown / pixels.length;
  const sharpness = laplacianVariance(pixels, width, height);
  const { changed, blocks } = reference
    ? changedBlocks(pixels, reference, width, height)
    : { changed: [] as Spot[], blocks: 0 };
  const drift = blocks === 0 ? 0 : changed.length / blocks;

  const issues: ImageIssueCode[] = [];
  if (brightness < IMAGE_THRESHOLDS.dark) issues.push('dark');
  else if (brightness > IMAGE_THRESHOLDS.washedOut) issues.push('washedOut');
  if (glare > IMAGE_THRESHOLDS.glare) issues.push('glare');
  if (sharpness < IMAGE_THRESHOLDS.sharpness) issues.push('blurry');
  if (drift > IMAGE_THRESHOLDS.drift) issues.push('moved');

  return {
    brightness,
    glare,
    sharpness,
    drift,
    issues,
    glareSpots: issues.includes('glare') ? blownSpots(pixels, width, height) : [],
    changedSpots: issues.includes('moved') ? changed : [],
  };
}
