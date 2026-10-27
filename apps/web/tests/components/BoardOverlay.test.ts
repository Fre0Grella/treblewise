import { render } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';

import BoardOverlay from '@/components/BoardOverlay.vue';

const W = 400;
const H = 400;

/** Drags from one point to another, in image pixels (the overlay is drawn 1:1 here). */
function drag(svg: SVGSVGElement, from: { x: number; y: number }, to: { x: number; y: number }) {
  svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: from.x, clientY: from.y, bubbles: true }));
  svg.dispatchEvent(new MouseEvent('pointermove', { clientX: to.x, clientY: to.y, bubbles: true }));
  svg.dispatchEvent(new MouseEvent('pointerup', { clientX: to.x, clientY: to.y, bubbles: true }));
}

/** A mark in the board since an earlier photograph. */
const IN_BOARD = 'inBoard' as const;

function overlay(darts: { img: { x: number; y: number }; label: string; kind: 'inBoard' | 'new' | 'proposed' }[]) {
  const onDartMove = vi.fn();
  const { container } = render(BoardOverlay, { props: { width: W, height: H, darts, onDartMove } });
  const svg = container.querySelector('svg')!;
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0, toJSON: () => ({}) });
  svg.setPointerCapture = () => undefined;
  return { svg, onDartMove };
}

describe('BoardOverlay', () => {
  it('picks the mark of this photograph over one in the board next to it', () => {
    // The dart in the board is the nearer one to the finger, by a little.
    const { svg, onDartMove } = overlay([
      { img: { x: 200, y: 200 }, label: 'T20', kind: IN_BOARD },
      { img: { x: 210, y: 200 }, label: 'T20?', kind: 'proposed' },
    ]);
    drag(svg, { x: 203, y: 200 }, { x: 214, y: 204 });
    expect(onDartMove.mock.lastCall?.[0]).toBe(1);
  });

  it('still picks a mark in the board when it is the only one under the finger', () => {
    const { svg, onDartMove } = overlay([
      { img: { x: 100, y: 100 }, label: 'S5', kind: IN_BOARD },
      { img: { x: 300, y: 300 }, label: 'T20', kind: 'new' },
    ]);
    drag(svg, { x: 102, y: 101 }, { x: 110, y: 104 });
    expect(onDartMove.mock.lastCall?.[0]).toBe(0);
  });

  it('picks the nearest of two marks of the same kind', () => {
    const { svg, onDartMove } = overlay([
      { img: { x: 200, y: 200 }, label: 'T20', kind: 'new' },
      { img: { x: 212, y: 200 }, label: 'T20', kind: 'new' },
    ]);
    drag(svg, { x: 210, y: 200 }, { x: 220, y: 200 });
    expect(onDartMove.mock.lastCall?.[0]).toBe(1);
  });
});

describe('calibration markers', () => {
  function markers(lensSrc: string | null = 'blob:photo') {
    const onHandleMove = vi.fn();
    const handles = [{ point: { x: 200, y: 300 }, label: 'Top', hint: '' }];
    const { container } = render(BoardOverlay, { props: { width: W, height: H, handles, onHandleMove, lensSrc } });
    const svg = container.querySelector('svg')!;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0, toJSON: () => ({}) });
    svg.setPointerCapture = () => undefined;
    return { svg, container, onHandleMove };
  }

  it('moves by as much as the finger does, rather than jumping under it', () => {
    const { svg, onHandleMove } = markers();
    // Grabbed 10 px to the right of its point and dragged 5 px up.
    drag(svg, { x: 210, y: 300 }, { x: 210, y: 295 });
    expect(onHandleMove.mock.lastCall).toEqual([0, { x: 200, y: 295 }]);
  });

  it('shows the photograph magnified in a lens while it is dragged, and not after', async () => {
    const { svg, container } = markers();
    expect(container.querySelector('.board-overlay-lens')).toBeNull();
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, clientY: 300, bubbles: true }));
    await Promise.resolve();
    expect(container.querySelector('.board-overlay-lens image')?.getAttribute('href')).toBe('blob:photo');
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 200, clientY: 300, bubbles: true }));
    await Promise.resolve();
    expect(container.querySelector('.board-overlay-lens')).toBeNull();
  });

  it('has no lens without a photograph to magnify', async () => {
    const { svg, container } = markers(null);
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, clientY: 300, bubbles: true }));
    await Promise.resolve();
    expect(container.querySelector('.board-overlay-lens')).toBeNull();
  });
});
