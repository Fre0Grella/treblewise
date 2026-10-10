import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';

import LegTrend, { type LegPoint } from '@/components/charts/LegTrend.vue';
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

// Two legs on the 1st, one on the 5th, two on the 13th.
const points: LegPoint[] = [
  { matchId: 'a', at: at(1, 20), average: 40.25, checkoutPercent: 25 },
  { matchId: 'a', at: at(1, 21), average: 44, checkoutPercent: null },
  { matchId: 'b', at: at(5, 21), average: 52.5, checkoutPercent: null },
  { matchId: 'c', at: at(13, 21), average: 34.95, checkoutPercent: 9.09 },
  { matchId: 'c', at: at(13, 22), average: 38, checkoutPercent: 50 },
];

const show = (shown = points) =>
  render(LegTrend, {
    props: { points: shown, reference: 42.6 },
    global: { plugins: [createAppRouter(createMemoryHistory())] },
  });

const slider = () => screen.getByRole('slider', { name: 'Leg' }) as HTMLInputElement;

function plotOf(container: Element): HTMLElement {
  const plot = container.querySelector('.leg-trend-plot') as HTMLElement;
  plot.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 180, right: 300, bottom: 180, x: 0, y: 0, toJSON: () => ({}) });
  return plot;
}

describe('the leg by leg chart', () => {
  it('counts legs, and keeps the cursor away until the chart is in use', () => {
    const { container } = show();
    expect(screen.getByText(/from 5 legs/i)).toBeDefined();
    expect(slider().value).toBe('4');
    // The period's average is always there; the picked leg's numbers are not.
    expect(screen.getByText('42.6')).toBeDefined();
    expect(screen.queryByText('38.0')).toBeNull();
    expect(container.querySelector('.leg-trend-cursor')).toBeNull();
  });

  it('shows the leg under a mouse while it is over the chart, and hides it once it leaves', async () => {
    const { container } = show();
    const plot = plotOf(container);
    await fireEvent.pointerMove(plot, { clientX: 10 });
    expect(screen.getByText('40.3')).toBeDefined();
    expect(screen.getByText('25%')).toBeDefined();
    expect(screen.getByText(/^2026\/09\/01/)).toBeDefined();
    expect(container.querySelector('.leg-trend-cursor')).not.toBeNull();

    await fireEvent.pointerLeave(plot);
    expect(screen.queryByText('40.3')).toBeNull();
    expect(container.querySelector('.leg-trend-cursor')).toBeNull();
    // Still picked, to open its match.
    expect(screen.getByRole('link', { name: /open the match of 2026\/09\/01 20:05/i }).getAttribute('href')).toBe('/history/a');
  });

  it('follows a finger while it is on the chart, and goes when it lifts', async () => {
    const { container } = show();
    const plot = plotOf(container);
    await fireEvent.pointerDown(plot, { clientX: 150, pointerType: 'touch' });
    expect(slider().value).toBe('2');
    expect(screen.getByText('52.5')).toBeDefined();
    expect(screen.getByText('—')).toBeDefined();
    await fireEvent.pointerMove(plot, { clientX: 290, pointerType: 'touch' });
    expect(slider().value).toBe('4');

    await fireEvent.pointerUp(plot, { pointerType: 'touch' });
    expect(screen.queryByText('38.0')).toBeNull();
    // A finger lifted: moving on no longer scrubs.
    await fireEvent.pointerMove(plot, { clientX: 10, pointerType: 'touch' });
    expect(slider().value).toBe('4');
  });

  it('moves with the keys on the slider, which says what it is on', async () => {
    show();
    await fireEvent.keyDown(slider(), { key: 'ArrowLeft' });
    await fireEvent.update(slider(), '3');
    expect(slider().getAttribute('aria-valuetext')).toBe('2026/09/13 21:05: average 35.0, checkout 9%');
    expect(screen.getByText('35.0')).toBeDefined();
    await fireEvent.blur(slider());
    expect(screen.queryByText('35.0')).toBeNull();
  });

  it('shades every other day and names the days wide enough to hold a name', () => {
    const { container } = show();
    const days = [...container.querySelectorAll('.leg-trend-day')];
    expect(days).toHaveLength(3);
    expect(days.map((day) => day.classList.contains('leg-trend-day-shaded'))).toEqual([false, true, false]);
    // At a phone's width, until the chart is measured, all three have room.
    expect([...container.querySelectorAll('.leg-trend-day-name')].map((name) => name.textContent)).toEqual([
      '09/01',
      '09/05',
      '09/13',
    ]);
    // Edge to edge, each reaching halfway to its neighbours.
    const widths = days.map((day) => parseFloat((day as HTMLElement).style.width));
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100, 6);
  });

  it('goes back to the latest leg when the legs change', async () => {
    const { rerender } = show();
    await fireEvent.update(slider(), '0');
    await rerender({ points: points.slice(0, 3), reference: 46 });
    expect(slider().value).toBe('2');
  });
});
