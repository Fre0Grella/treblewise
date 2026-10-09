import { describe, expect, it } from 'vitest';

import { LENS_MAGNIFICATION, lensGeometry } from '@/components/lens.js';

const FRAME = { width: 720, height: 1280 };
/** The board's square in that photograph. */
const CROP = { x: 60, y: 300, width: 600, height: 600 };
/** The stage it is shown in: 400 px across, so 1.5 photograph pixels per screen pixel. */
const STAGE = { width: 400, height: 400 };

describe('lensGeometry', () => {
  it('reads the pointer back as the photograph pixel under it, through the crop', () => {
    const lens = lensGeometry({ x: 200, y: 100 }, STAGE, FRAME, CROP);
    expect(lens.image).toEqual({ x: 60 + 300, y: 300 + 150 });
  });

  it('puts that pixel at the centre of the lens', () => {
    const pointer = { x: 120, y: 260 };
    const lens = lensGeometry(pointer, STAGE, FRAME, CROP);
    const scale = STAGE.width / CROP.width;
    const centre = lens.size / 2;
    // Where the photograph pixel under the pointer lands inside the lens.
    const x = lens.content.left + lens.image.x * scale * LENS_MAGNIFICATION;
    const y = lens.content.top + lens.image.y * scale * LENS_MAGNIFICATION;
    expect(x).toBeCloseTo(centre);
    expect(y).toBeCloseTo(centre);
    expect(lens.content.width).toBeCloseTo(FRAME.width * scale * LENS_MAGNIFICATION);
  });

  it('sits directly above the pointer, even at the top edge', () => {
    const lens = lensGeometry({ x: 30, y: 5 }, STAGE, FRAME, CROP);
    expect(lens.left + lens.size / 2).toBe(30);
    expect(lens.top + lens.size).toBeLessThan(5);
  });

  it('works on an uncropped photograph too', () => {
    const lens = lensGeometry({ x: 100, y: 200 }, { width: 360, height: 640 }, FRAME, null);
    expect(lens.image).toEqual({ x: 200, y: 400 });
  });
});
