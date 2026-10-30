import { fireEvent, render } from '@testing-library/vue';
import { beforeEach, describe, expect, it } from 'vitest';

import Fold from '@/components/ui/Fold.vue';

const details = (container: Element) => container.querySelector('details')!;

describe('a fold', () => {
  beforeEach(() => localStorage.clear());

  it('is open until someone closes it, and stays closed after', async () => {
    const first = render(Fold, { props: { id: 'a', summary: 'About' }, slots: { default: 'text' } });
    expect(details(first.container).open).toBe(true);
    details(first.container).open = false;
    await fireEvent(details(first.container), new Event('toggle'));
    first.unmount();
    expect(details(render(Fold, { props: { id: 'a', summary: 'About' } }).container).open).toBe(false);
  });

  it('can start closed, and then stays open once opened', async () => {
    const first = render(Fold, { props: { id: 'b', summary: 'About', closed: true } });
    expect(details(first.container).open).toBe(false);
    details(first.container).open = true;
    await fireEvent(details(first.container), new Event('toggle'));
    first.unmount();
    expect(details(render(Fold, { props: { id: 'b', summary: 'About', closed: true } }).container).open).toBe(true);
  });
});
