import { BOARD } from '@treblewise/core';
import { render, screen } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import Dartboard from '@/components/Dartboard.vue';
import { placeLens } from '@/components/dartboardGeometry.js';

const R = BOARD.boardRadius;

describe('placeLens', () => {
  it('puts the lens above the finger, where a hand is not', () => {
    const lens = placeLens({ x: 0, y: 0 });
    expect(lens.cy).toBeLessThan(0); // smaller y is higher on screen
    expect(lens.cx).toBe(0);
  });

  it('stays above the finger across the whole board, including the 20', () => {
    // The lens jumping aside as the finger crossed the top was the complaint
    // this replaced: wherever the finger is, the lens is directly above it.
    for (let x = -R; x <= R; x += 10) {
      for (let y = -R; y <= R; y += 10) {
        const lens = placeLens({ x, y });
        expect(lens.cy, `finger at ${x},${y}`).toBeLessThan(y);
      }
    }
  });

  it('tracks the finger sideways exactly, with no sliding about', () => {
    // The lens is directly above the finger everywhere, including off the edge
    // of the board: never nudged aside, never re-found with the eyes.
    for (const x of [-R, -170, -90, 0, 90, 170, R]) {
      expect(placeLens({ x, y: 0 }).cx).toBe(x);
    }
  });

  it('never covers the point it is magnifying', () => {
    for (let x = -R; x <= R; x += 25) {
      for (let y = -R; y <= R; y += 25) {
        const lens = placeLens({ x, y });
        const gap = Math.hypot(lens.cx - x, lens.cy - y);
        expect(gap, `finger at ${x},${y}`).toBeGreaterThan(58);
      }
    }
  });
});

/** jsdom gives every element a zero-sized box, so the board needs one. */
function sizeTheBoard(element: Element, size = 400) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: size,
    bottom: size,
    width: size,
    height: size,
    toJSON: () => ({}),
  });
}

describe('the board', () => {
  it('shows a magnified lens while a finger is down, and scores on release', async () => {
    const { container, emitted } = render(Dartboard, { props: { interactive: true } });

    const svg = screen.getByRole('button', { name: /dartboard/i });
    sizeTheBoard(svg);
    // jsdom has no pointer capture.
    (svg as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};

    expect(container.querySelector('.dartboard-lens')).toBeNull();

    // The centre of a 400 px board is the bull.
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, clientY: 200, bubbles: true }));
    await nextTick();

    const lens = container.querySelector('.dartboard-lens');
    expect(lens).not.toBeNull();
    expect(lens!.textContent).toContain('BULL');
    // The lens magnifies: the board is drawn again, scaled.
    expect(lens!.innerHTML).toContain('scale(3.2)');

    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 200, clientY: 200, bubbles: true }));
    await nextTick();

    const hits = emitted<[unknown]>('hit');
    expect(hits).toHaveLength(1);
    expect(hits[0]![0]).toMatchObject({ ring: 'bull', value: 50 });
    expect(container.querySelector('.dartboard-lens')).toBeNull();
  });

  it('does nothing at all when disabled', async () => {
    const { container, emitted } = render(Dartboard, { props: { interactive: true, disabled: true } });
    const svg = screen.getByRole('button', { name: /dartboard/i });
    sizeTheBoard(svg);
    (svg as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};

    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, clientY: 200, bubbles: true }));
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 200, clientY: 200, bubbles: true }));
    await nextTick();

    expect(container.querySelector('.dartboard-lens')).toBeNull();
    expect(emitted('hit')).toBeUndefined();
  });
});
