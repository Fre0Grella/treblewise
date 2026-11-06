/**
 * The heat map's colours and its painting: one hue, dark to light, for a dark
 * surface, a sequential yellow ramp, the tokens --heat-1 to --heat-5 in
 * global.css.
 *
 * Two ways to paint:
 *  - `fade` (where the darts land): values below the first stop stay
 *    transparent, so the board shows through where nothing happened;
 *  - `full` (a value everywhere, as where to aim): from black at the lowest
 *    value to yellow at the highest, so the colour spreads over the whole
 *    range instead of everything being some yellow.
 */

import { BOARD, type BoardGrid } from '@treblewise/core';

const RAMP_TOKENS = ['--heat-1', '--heat-2', '--heat-3', '--heat-4', '--heat-5'] as const;

export type RampStyle = 'fade' | 'full';

type Rgb = [number, number, number];

/** The full ramp starts from black, below the heat tokens. */
const BLACK: Rgb = [0, 0, 0];

/**
 * The full ramp's curve: most of the board is worth something, so a straight
 * scale painted nearly all of it yellow. Squared, only the best places glow
 * and the middle of the range is a dark amber.
 */
const FULL_CURVE = 2;

/**
 * The ramp as numbers, read from the page's tokens: a canvas is painted pixel
 * by pixel and cannot take `var()`. The tokens are plain `#rrggbb` for this.
 */
function readRamp(style: RampStyle): Rgb[] {
  const css = getComputedStyle(document.documentElement);
  const tokens = RAMP_TOKENS.map((name) => {
    const hex = css.getPropertyValue(name).trim().replace('#', '');
    return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)) as Rgb;
  });
  return style === 'full' ? [BLACK, ...tokens] : tokens;
}

function rampColour(ramp: Rgb[], t: number, style: RampStyle): [number, number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (ramp.length - 1);
  const index = Math.min(ramp.length - 2, Math.floor(scaled));
  const frac = scaled - index;
  const a = ramp[index]!;
  const b = ramp[index + 1]!;
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
    // Fading, the bottom of the scale goes, so "nothing here" reads as
    // nothing; full, the board still shows a little through the dark end.
    Math.round(255 * (style === 'fade' ? Math.min(1, 0.15 + clamped * 1.4) : 0.72 + clamped * 0.28)),
  ];
}

/**
 * The lowest value on the board itself, inside the double ring: the full
 * ramp's black. Off the board everything scores nothing, and taking that as
 * the bottom left the whole board some shade of yellow.
 */
export function boardMin(grid: BoardGrid): number {
  let low = Infinity;
  for (let iy = 0; iy < grid.size; iy += 1) {
    for (let ix = 0; ix < grid.size; ix += 1) {
      const x = -grid.half + ix * grid.step;
      const y = -grid.half + iy * grid.step;
      if (Math.hypot(x, y) <= BOARD.doubleOuterRadius) low = Math.min(low, grid.values[iy * grid.size + ix]!);
    }
  }
  return Number.isFinite(low) ? low : 0;
}

export interface PaintOptions {
  /** Values at or below this share of the range are left empty (fading only). */
  floor: number;
  /** The value drawn brightest; the grid's own maximum by default. */
  scale?: number;
  style: RampStyle;
}

/**
 * The grid painted into an image, as a data URL, or null where there is no
 * canvas (tests). One image rather than eight thousand rectangles is the
 * difference between a page that scrolls and one that does not.
 */
export function paintGrid(grid: BoardGrid, { floor, scale, style }: PaintOptions): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = grid.size;
  canvas.height = grid.size;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const ramp = readRamp(style);
  const peak = scale ?? Math.max(...grid.values, 1e-6);
  const low = style === 'full' ? boardMin(grid) : 0;
  const range = Math.max(peak - low, 1e-6);
  const pixels = context.createImageData(grid.size, grid.size);

  for (let iy = 0; iy < grid.size; iy += 1) {
    for (let ix = 0; ix < grid.size; ix += 1) {
      const share = Math.max(0, (grid.values[iy * grid.size + ix]! - low) / range);
      const value = style === 'full' ? share ** FULL_CURVE : share;
      // The grid's y runs up the board; an image's runs down it.
      const at = ((grid.size - 1 - iy) * grid.size + ix) * 4;
      if (style === 'fade' && value <= floor) {
        pixels.data[at + 3] = 0;
        continue;
      }
      const [r, g, b, a] = rampColour(ramp, value, style);
      pixels.data[at] = r;
      pixels.data[at + 1] = g;
      pixels.data[at + 2] = b;
      pixels.data[at + 3] = a;
    }
  }

  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL();
}

/**
 * The ramp as CSS stops, for a legend next to the map: along the legend the
 * values run evenly, so on the full ramp each colour sits where the curve
 * puts it.
 */
export function rampStops(style: RampStyle = 'fade', curved = style === 'full'): string {
  const colours = [...(style === 'full' ? ['#000'] : []), ...RAMP_TOKENS.map((name) => `var(${name})`)];
  const at = (index: number) => {
    const t = index / (colours.length - 1);
    return curved ? t ** (1 / FULL_CURVE) : t;
  };
  return colours.map((colour, index) => `${colour} ${(at(index) * 100).toFixed(1)}%`).join(', ');
}

/** One colour of the full ramp, as CSS, for a share from 0 to 1, without the curve: a board painted by a statistic. */
export function rampColourAt(t: number): string {
  if (typeof document === 'undefined') return 'transparent';
  const [r, g, b] = rampColour(readRamp('full'), t, 'full');
  return `rgb(${r} ${g} ${b})`;
}
