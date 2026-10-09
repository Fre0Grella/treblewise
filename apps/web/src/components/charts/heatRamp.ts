/**
 * The heat map's colours and its painting: one hue, dark to light, for a dark
 * surface, a sequential yellow ramp, the tokens --heat-1 to --heat-5 in
 * global.css. Values below the first stop stay transparent so the board itself
 * shows through where nothing happened.
 */

import type { BoardGrid } from '@treblewise/core';

const RAMP_TOKENS = ['--heat-1', '--heat-2', '--heat-3', '--heat-4', '--heat-5'] as const;

type Rgb = [number, number, number];

/**
 * The ramp as numbers, read from the page's tokens: a canvas is painted pixel
 * by pixel and cannot take `var()`. The tokens are plain `#rrggbb` for this.
 */
function readRamp(): Rgb[] {
  const style = getComputedStyle(document.documentElement);
  return RAMP_TOKENS.map((name) => {
    const hex = style.getPropertyValue(name).trim().replace('#', '');
    return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)) as Rgb;
  });
}

function rampColour(ramp: Rgb[], t: number): [number, number, number, number] {
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
    // Fade out the bottom of the scale so "nothing here" reads as nothing.
    Math.round(255 * Math.min(1, 0.15 + clamped * 1.4)),
  ];
}

/**
 * The grid painted into an image, as a data URL, or null where there is no
 * canvas (tests). One image rather than eight thousand rectangles is the
 * difference between a page that scrolls and one that does not.
 */
export function paintGrid(grid: BoardGrid, floor: number, scale?: number): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = grid.size;
  canvas.height = grid.size;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const ramp = readRamp();
  const peak = scale ?? Math.max(...grid.values, 1e-6);
  const pixels = context.createImageData(grid.size, grid.size);

  for (let iy = 0; iy < grid.size; iy += 1) {
    for (let ix = 0; ix < grid.size; ix += 1) {
      const value = grid.values[iy * grid.size + ix]! / peak;
      // The grid's y runs up the board; an image's runs down it.
      const at = ((grid.size - 1 - iy) * grid.size + ix) * 4;
      if (value <= floor) {
        pixels.data[at + 3] = 0;
        continue;
      }
      const [r, g, b, a] = rampColour(ramp, value);
      pixels.data[at] = r;
      pixels.data[at + 1] = g;
      pixels.data[at + 2] = b;
      pixels.data[at + 3] = a;
    }
  }

  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL();
}

/** The ramp as CSS stops, for a legend next to the map. */
export function rampStops(): string {
  return RAMP_TOKENS.map((name, index) => `var(${name}) ${(index / (RAMP_TOKENS.length - 1)) * 100}%`).join(', ');
}
