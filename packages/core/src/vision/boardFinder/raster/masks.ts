/**
 * Pixels: the few image operations the board finder needs, and nothing that
 * knows what a dartboard is.
 *
 * This is the part OpenCV would have been. It is kept apart, and imports
 * nothing from outside `raster/`, so that it stays generic: an HSV threshold,
 * a morphological close, connected components and bilinear sampling.
 */

/** RGBA, row-major, four bytes a pixel: what `ImageData` holds. */
export interface RgbaImage {
  readonly data: Uint8ClampedArray | Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** One byte a pixel, 1 where the pixel is in and 0 where it is not. */
export interface Mask {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** One float a pixel. */
export interface Field {
  readonly data: Float32Array;
  readonly width: number;
  readonly height: number;
}

/**
 * A range of hues, in degrees. `from` may be larger than `to`, for a band
 * that wraps through 0° (red).
 */
export interface HueBand {
  readonly from: number;
  readonly to: number;
}

export interface Colourfulness {
  /** Saturation, 0–1: below it a pixel is grey whatever its hue. */
  readonly minSaturation: number;
  /** Value (brightness), 0–1: below it a pixel is too dark to have a hue. */
  readonly minValue: number;
}

/** The pixels whose hue falls in `band` and that are saturated and bright enough. */
export function hueMask(image: RgbaImage, band: HueBand, colourful: Colourfulness): Mask {
  const { width, height, data } = image;
  const out = new Uint8Array(width * height);
  const wraps = band.from > band.to;
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    const r = data[p]! / 255;
    const g = data[p + 1]! / 255;
    const b = data[p + 2]! / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < colourful.minValue || max === 0) continue;
    const chroma = max - min;
    if (chroma / max < colourful.minSaturation) continue;
    let hue: number;
    if (max === r) hue = ((g - b) / chroma) % 6;
    else if (max === g) hue = (b - r) / chroma + 2;
    else hue = (r - g) / chroma + 4;
    hue = (hue * 60 + 360) % 360;
    const inside = wraps ? hue >= band.from || hue <= band.to : hue >= band.from && hue <= band.to;
    if (inside) out[i] = 1;
  }
  return { data: out, width, height };
}

export function union(a: Mask, b: Mask): Mask {
  const out = new Uint8Array(a.data.length);
  for (let i = 0; i < out.length; i += 1) out[i] = a.data[i]! | b.data[i]!;
  return { data: out, width: a.width, height: a.height };
}

/** The offsets of a disc of `radius` pixels. */
function disc(radius: number): Array<[number, number]> {
  const offsets: Array<[number, number]> = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy <= radius * radius + radius) offsets.push([dx, dy]);
    }
  }
  return offsets;
}

/** Dilation keeps a pixel in if any of the disc is in; erosion only if all of it is. */
function morph(mask: Mask, offsets: Array<[number, number]>, dilate: boolean): Mask {
  const { width, height, data } = mask;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = !dilate;
      for (const [dx, dy] of offsets) {
        const xx = x + dx;
        const yy = y + dy;
        // Outside the picture counts as out for a dilation and as in for an
        // erosion, so a close never eats into the picture's edge.
        const on = xx >= 0 && yy >= 0 && xx < width && yy < height ? data[yy * width + xx] === 1 : !dilate;
        if (dilate ? on : !on) {
          hit = dilate;
          break;
        }
      }
      if (hit) out[y * width + x] = 1;
    }
  }
  return { data: out, width, height };
}

/** A morphological close: dilate then erode with a disc, which fills gaps narrower than the disc. */
export function close(mask: Mask, radius: number): Mask {
  const offsets = disc(radius);
  return morph(morph(mask, offsets, true), offsets, false);
}

export interface Component {
  readonly area: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  /** Centroid. */
  readonly x: number;
  readonly y: number;
}

/** The 8-connected regions of a mask, with their size and centre. */
export function components(mask: Mask): Component[] {
  const { width, height, data } = mask;
  const seen = new Uint8Array(data.length);
  const stack = new Int32Array(data.length);
  const found: Component[] = [];
  for (let start = 0; start < data.length; start += 1) {
    if (data[start] !== 1 || seen[start] === 1) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    while (top > 0) {
      const i = stack[--top]!;
      const x = i % width;
      const y = (i - x) / width;
      area += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const j = yy * width + xx;
          if (data[j] === 1 && seen[j] === 0) {
            seen[j] = 1;
            stack[top++] = j;
          }
        }
      }
    }
    found.push({ area, minX, minY, maxX, maxY, x: sumX / area, y: sumY / area });
  }
  return found;
}

/** A mask as a field: 1 in, 0 out, then each mask's `weight` added in. */
export function field(width: number, height: number, ...terms: Array<[Mask, number]>): Field {
  const out = new Float32Array(width * height);
  for (const [mask, weight] of terms) {
    for (let i = 0; i < out.length; i += 1) if (mask.data[i] === 1) out[i]! += weight;
  }
  return { data: out, width, height };
}

/** A 3×3 Gaussian blur (1 2 1 / 2 4 2 / 1 2 1), edges repeated. */
export function blur3(input: Field): Field {
  const { width, height, data } = input;
  const out = new Float32Array(data.length);
  const at = (x: number, y: number) =>
    data[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))]!;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      out[y * width + x] =
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) +
          2 * at(x - 1, y) + 4 * at(x, y) + 2 * at(x + 1, y) +
          at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) /
        16;
    }
  }
  return { data: out, width, height };
}

/** The field between pixels, by bilinear interpolation; NaN outside the picture. */
export function sample(input: Field, x: number, y: number): number {
  const { width, height, data } = input;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (!(x0 >= 0 && y0 >= 0 && x0 + 1 < width && y0 + 1 < height)) return Number.NaN;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * width + x0;
  return (
    data[i]! * (1 - fx) * (1 - fy) +
    data[i + 1]! * fx * (1 - fy) +
    data[i + width]! * (1 - fx) * fy +
    data[i + width + 1]! * fx * fy
  );
}

/** Whether the mask is in at a pixel; out of the picture is out. */
export function inMask(mask: Mask, x: number, y: number): boolean {
  const xi = Math.round(x);
  const yi = Math.round(y);
  return xi >= 0 && yi >= 0 && xi < mask.width && yi < mask.height && mask.data[yi * mask.width + xi] === 1;
}
