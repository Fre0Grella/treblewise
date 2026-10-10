import { render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import Wordmark from '@/components/Wordmark.vue';

describe('the wordmark', () => {
  it('is announced as the name, not as a picture of shapes', () => {
    render(Wordmark);
    const mark = screen.getByRole('img', { name: 'treblewise' });
    expect(mark.tagName.toLowerCase()).toBe('svg');
  });

  it('draws the letters in the text colour and the beds and bull in the board colours', () => {
    const { container } = render(Wordmark);
    const parts = (cls: string) => container.querySelectorAll(`.${cls}`);
    expect(parts('wordmark-ink')).toHaveLength(1);
    // the beds, then the bull's ring and centre
    expect(parts('wordmark-red')).toHaveLength(2);
    expect(parts('wordmark-green')).toHaveLength(2);
    // Outlines only: the mark must not depend on a font being there.
    expect(container.querySelectorAll('text')).toHaveLength(0);
  });
});
