import { BULL, hit } from '@treblewise/core';
import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import BullView from '@/components/order/BullView.vue';
import { OPENING_HALF } from '@/components/order/bullFrame.js';

// Unmeasured, as in jsdom, the view is 640 × 480 and opens on the bull.
const scale = 480 / (2 * OPENING_HALF);

// jsdom has no PointerEvent: a mouse event with the same name stands in.
function tap(stage: Element, x: number, y: number) {
  stage.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
  stage.dispatchEvent(new MouseEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
}

describe('the bull-off view', () => {
  it('puts a tapped dart where it landed on the board', () => {
    const { container, emitted } = render(BullView, { props: { darts: [] } });
    const stage = container.querySelector('.bull-view-stage')!;
    tap(stage, 320, 240);
    tap(stage, 320, 240 - 50 * scale);
    const hits = emitted<[unknown, { x: number; y: number }]>().hit!;
    expect(hits[0]![0]).toEqual(BULL);
    expect(hits[1]![0]).toEqual(hit(20, 'single'));
    expect(hits[1]![1].y).toBeCloseTo(50);
  });

  it('takes no taps once it is decided', () => {
    const { container, emitted } = render(BullView, { props: { darts: [], disabled: true } });
    tap(container.querySelector('.bull-view-stage')!, 320, 240);
    expect(emitted().hit).toBeUndefined();
  });

  it('marks each dart with its thrower and how far it is from the bull', () => {
    const { container } = render(BullView, {
      props: { darts: [{ id: 'ann', number: 1, hit: hit(20, 'single'), pos: { x: 0, y: 30 }, leader: true }] },
      slots: { default: 'Bob, throw at the bull.' },
    });
    expect(screen.getByText('30 mm')).toBeDefined();
    expect(container.querySelector('.bull-view-mark')?.textContent).toBe('1');
    expect(screen.getByText('Bob, throw at the bull.')).toBeDefined();
  });

  it('shows the whole board for a dart outside the frame', async () => {
    render(BullView, { props: { darts: [] } });
    const whole = screen.getByRole('button', { name: /show the whole board/i });
    await fireEvent.click(whole);
    expect(screen.getByRole('button', { name: /back to the darts/i }).getAttribute('aria-pressed')).toBe('true');
  });
});
