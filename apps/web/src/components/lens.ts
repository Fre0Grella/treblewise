/**
 * Where the magnifying lens over a photograph goes, and what it shows.
 *
 * The same rule as the tap-the-board lens (`Dartboard.tsx`, `placeLens`): the
 * lens sits directly above the pointer, always, and floats past the edge of
 * the photograph rather than jumping aside. A lens you have to find again with
 * your eyes is not a lens.
 *
 * Everything is in screen pixels, relative to the stage (the box the
 * photograph is shown in), which may be cropped to the board's square.
 */

export interface LensGeometry {
  /** The lens circle, relative to the stage. */
  left: number;
  top: number;
  size: number;
  /** The magnified photograph inside the lens, relative to the lens. */
  content: { left: number; top: number; width: number; height: number };
  /** The pointer, in the photograph's own pixels. */
  image: { x: number; y: number };
}

export const LENS_MAGNIFICATION = 3;
/** Between the lens and the pointer: clear of a fingertip, still close. */
const LENS_GAP = 24;

export function lensGeometry(
  pointer: { x: number; y: number },
  stage: { width: number; height: number },
  frame: { width: number; height: number },
  crop: { x: number; y: number; width: number; height: number } | null,
  magnification = LENS_MAGNIFICATION,
): LensGeometry {
  // The whole photograph, as laid out behind the stage.
  const scale = crop ? stage.width / crop.width : stage.width / frame.width;
  const originX = crop ? -crop.x * scale : 0;
  const originY = crop ? -crop.y * scale : 0;

  const size = Math.round(Math.min(220, Math.max(110, stage.width * 0.3)));
  const centreX = pointer.x;
  const centreY = pointer.y - size / 2 - LENS_GAP;

  return {
    left: centreX - size / 2,
    top: centreY - size / 2,
    size,
    content: {
      left: size / 2 - (pointer.x - originX) * magnification,
      top: size / 2 - (pointer.y - originY) * magnification,
      width: frame.width * scale * magnification,
      height: frame.height * scale * magnification,
    },
    image: { x: (pointer.x - originX) / scale, y: (pointer.y - originY) / scale },
  };
}
