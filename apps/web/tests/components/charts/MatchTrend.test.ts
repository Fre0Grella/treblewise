import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';

import MatchTrend, { type MatchPoint } from '@/components/charts/MatchTrend.vue';
import { createAppRouter } from '@/router/index.js';

// jsdom has no PointerEvent: a mouse event with a pointer's fields stands in.
class FakePointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}
globalThis.PointerEvent ??= FakePointerEvent as unknown as typeof PointerEvent;

const at = (day: number, hour: number) => new Date(2026, 8, day, hour, 5).getTime();

const points: MatchPoint[] = [
  { id: 'a', at: at(1, 20), average: 40.25, checkoutPercent: 25 },
  { id: 'b', at: at(5, 21), average: 52.5, checkoutPercent: null },
  { id: 'c', at: at(13, 21), average: 34.95, checkoutPercent: 9.09 },
];

const show = (shown = points) =>
  render(MatchTrend, {
    props: { points: shown, reference: 42.6 },
    global: { plugins: [createAppRouter(createMemoryHistory())] },
  });

const slider = () => screen.getByRole('slider', { name: 'Match' }) as HTMLInputElement;

describe('the match by match chart', () => {
  it('opens on the latest match, with its date and both numbers beside the cursor', () => {
    show();
    expect(screen.getByText(/from 3 matches/i)).toBeDefined();
    expect(slider().value).toBe('2');
    expect(slider().getAttribute('aria-valuetext')).toBe('2026/09/13 21:05: average 35.0, checkout 9%');
    expect(screen.getByText('35.0')).toBeDefined();
    expect(screen.getByText('9%')).toBeDefined();
    // The period's average, on its dotted line.
    expect(screen.getByText('42.6')).toBeDefined();
  });

  it('moves to any match with the slider, and links to it', async () => {
    show();
    await fireEvent.update(slider(), '1');
    expect(slider().getAttribute('aria-valuetext')).toBe('2026/09/05 21:05: average 52.5, checkout —');
    expect(screen.getByRole('link', { name: /open this match/i }).getAttribute('href')).toBe('/history/b');

    await fireEvent.update(slider(), '0');
    expect(screen.getByText('40.3')).toBeDefined();
    expect(screen.getByText('25%')).toBeDefined();
  });

  it('follows a drag across the chart to the nearest match', async () => {
    const { container } = show();
    const plot = container.querySelector('.match-trend-plot') as HTMLElement;
    plot.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 180, right: 300, bottom: 180, x: 0, y: 0, toJSON: () => ({}) });
    await fireEvent.pointerDown(plot, { clientX: 10, pointerId: 1, pointerType: 'touch' });
    expect(slider().value).toBe('0');
    await fireEvent.pointerMove(plot, { clientX: 160, pointerId: 1, pointerType: 'touch' });
    expect(slider().value).toBe('1');
    await fireEvent.pointerUp(plot, { pointerId: 1, pointerType: 'touch' });
    // A finger lifted: moving on no longer scrubs.
    await fireEvent.pointerMove(plot, { clientX: 290, pointerId: 1, pointerType: 'touch' });
    expect(slider().value).toBe('1');
  });

  it('goes back to the latest match when the matches change', async () => {
    const { rerender } = show();
    await fireEvent.update(slider(), '0');
    await rerender({ points: points.slice(0, 2), reference: 46 });
    expect(slider().value).toBe('1');
  });
});
