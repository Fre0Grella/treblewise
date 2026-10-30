import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  blur3,
  close,
  components,
  field,
  hueMask,
  inMask,
  sample,
  union,
  type Mask,
  type RgbaImage,
} from '../../../../src/vision/boardFinder/raster/masks.js';

const COLOURFUL = { minSaturation: 0.35, minValue: 0.2 };

function image(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

function mask(rows: string[]): Mask {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) => [...row].forEach((c, x) => (data[y * width + x] = c === '#' ? 1 : 0)));
  return { data, width, height };
}

const draw = (m: Mask) =>
  Array.from({ length: m.height }, (_, y) => [...m.data.subarray(y * m.width, (y + 1) * m.width)].map((v) => (v ? '#' : '.')).join(''));

describe('hueMask', () => {
  it('picks the red, wrapping through 0°, and the green, and leaves grey, dark and pale alone', () => {
    const swatches: Array<[number, number, number]> = [
      [200, 30, 30], // red
      [200, 30, 60], // red, just short of 360°
      [30, 160, 60], // green
      [128, 128, 128], // grey
      [30, 5, 5], // red but too dark
      [230, 200, 200], // red but too pale
    ];
    const img = image(swatches.length, 1, (x) => swatches[x]!);
    expect([...hueMask(img, { from: 330, to: 20 }, COLOURFUL).data]).toEqual([1, 1, 0, 0, 0, 0]);
    expect([...hueMask(img, { from: 80, to: 190 }, COLOURFUL).data]).toEqual([0, 0, 1, 0, 0, 0]);
  });
});

describe('close', () => {
  it('fills a gap narrower than the disc and keeps the shape', () => {
    const m = mask([
      '............',
      '............',
      '..####.###..',
      '..####.###..',
      '............',
      '............',
    ]);
    expect(draw(close(m, 1))).toEqual([
      '............',
      '............',
      '..########..',
      '..########..',
      '............',
      '............',
    ]);
  });

  it('does not eat into a shape touching the edge of the picture', () => {
    const m = mask(['###...', '###...', '###...']);
    expect(draw(close(m, 1))).toEqual(draw(m));
  });
});

describe('components', () => {
  it('finds each region with its area, box and centre, diagonals joined', () => {
    const found = components(
      mask([
        '##....',
        '##..#.',
        '.....#',
        '......',
      ]),
    );
    expect(found).toHaveLength(2);
    expect(found[0]).toEqual({ area: 4, minX: 0, minY: 0, maxX: 1, maxY: 1, x: 0.5, y: 0.5 });
    expect(found[1]).toMatchObject({ area: 2, minX: 4, maxX: 5, x: 4.5, y: 1.5 });
  });
});

describe('field, blur3 and sample', () => {
  it('weights masks, blurs without changing the total much, and samples between pixels', () => {
    const red = mask(['#...', '....']);
    const green = mask(['...#', '....']);
    const f = field(4, 2, [red, 1], [green, -1]);
    expect([...f.data]).toEqual([1, 0, 0, -1, 0, 0, 0, 0]);

    const flat = blur3(field(4, 2, [mask(['####', '####']), 1]));
    expect([...flat.data].every((v) => Math.abs(v - 1) < 1e-6)).toBe(true);

    expect(sample(f, 0.5, 0)).toBeCloseTo(0.5);
    expect(sample(f, 0, 0.5)).toBeCloseTo(0.5);
    expect(Number.isNaN(sample(f, 3.5, 0))).toBe(true);
    expect(Number.isNaN(sample(f, -0.1, 0))).toBe(true);
  });

  it('union and inMask', () => {
    const u = union(mask(['#.']), mask(['.#']));
    expect([...u.data]).toEqual([1, 1]);
    expect(inMask(u, 0.4, 0)).toBe(true);
    expect(inMask(u, 2, 0)).toBe(false);
  });
});

describe('raster/', () => {
  it('imports nothing from outside raster/, so it stays generic', () => {
    const folder = fileURLToPath(new URL('../../../../src/vision/boardFinder/raster/', import.meta.url));
    for (const file of readdirSync(folder)) {
      const source = readFileSync(folder + file, 'utf8');
      for (const [, from] of source.matchAll(/from\s+'([^']+)'/g)) {
        expect(from, `${file} imports ${from}`).toMatch(/^\.\/[^/]+$/);
      }
    }
  });
});
