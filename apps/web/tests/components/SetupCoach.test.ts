import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';

import SetupCoach from '@/components/SetupCoach.vue';
import type { ImageQuality } from '@/vision/imageStats.js';

const quality = (overrides: Partial<ImageQuality>): ImageQuality => ({
  brightness: 120,
  glare: 0,
  sharpness: 80,
  drift: 0,
  issues: [],
  glareSpots: [],
  changedSpots: [],
  ...overrides,
});

describe('the setup coach', () => {
  it('says what a reflection warning measured, against the limit, and what to do', () => {
    render(SetupCoach, { props: { calibrated: true, view: null, quality: quality({ glare: 0.07, issues: ['glare'] }) } });
    expect(screen.getByText(/a reflection on the board/i)).toBeDefined();
    expect(screen.getByText(/7% of the board is pure white.*fine under 4%/i)).toBeDefined();
    expect(screen.getByText(/marked in yellow on the preview/i)).toBeDefined();
  });

  it('says how much of the board changed since calibration, and offers to show where', async () => {
    const showWhere = vi.fn();
    render(SetupCoach, {
      props: { calibrated: true, view: null, quality: quality({ drift: 0.5, issues: ['moved'] }), onShowWhere: showWhere },
    });
    expect(screen.getByText(/50% of the board looks different.*fine under 35%/i)).toBeDefined();
    await fireEvent.click(screen.getByRole('button', { name: /show where/i }));
    expect(showWhere).toHaveBeenCalledOnce();
  });

  it('beside another coach line, says nothing while the picture is fine', () => {
    const { container } = render(SetupCoach, { props: { calibrated: true, view: null, quality: quality({}), imageOnly: true } });
    expect(container.textContent).toBe('');
  });
});
