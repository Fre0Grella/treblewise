import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import ExposureControl from '@/components/ExposureControl.vue';

const range = { min: -2, max: 2, step: 0.5, value: 0 };

describe('the camera brightness control', () => {
  it('sets the brightness when the slider is let go', async () => {
    const { emitted } = render(ExposureControl, { props: { range, value: 0 } });
    const slider = screen.getByRole('slider', { name: /camera brightness/i });
    await fireEvent.update(slider, '-1.5');
    expect(emitted('change')).toBeUndefined();
    await fireEvent.change(slider);
    expect(emitted('change')).toEqual([[-1.5]]);
    expect(screen.getByText('−1.5')).toBeDefined();
  });

  it('says so when the camera has not taken the setting', () => {
    render(ExposureControl, { props: { range: { ...range, value: 0 }, value: -1 } });
    expect(screen.getByText(/camera says it is still at 0/i)).toBeDefined();
  });

  it("goes back to the camera's own choice", async () => {
    const { emitted } = render(ExposureControl, { props: { range, value: -1 } });
    await fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(emitted('change')).toEqual([[0]]);
  });
});
