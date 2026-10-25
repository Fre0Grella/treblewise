import { BULL, hit, type Hit, type PlayerConfig, type Point } from '@treblewise/core';
import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import BullOff from '@/components/order/BullOff.vue';

const players: PlayerConfig[] = [
  { id: 'ann', name: 'Ann' },
  { id: 'bob', name: 'Bob' },
];

/** The board, as buttons that each throw one dart: where a tap would have put it. */
const darts: Record<string, { hit: Hit; pos: Point }> = {
  'near miss': { hit: hit(20, 'single'), pos: { x: 0, y: 30 } },
  'closer': { hit: hit(3, 'single'), pos: { x: 0, y: -20 } },
  'in the bull': { hit: BULL, pos: { x: 1, y: 1 } },
};
const Board = defineComponent({
  emits: ['hit'],
  setup(_, { emit }) {
    return () => Object.entries(darts).map(([name, dart]) => h('button', { onClick: () => emit('hit', dart.hit, dart.pos) }, name));
  },
});

function renderBullOff() {
  const order = ref<PlayerConfig[] | null>(null);
  render(BullOff, {
    props: { players, order: order.value, 'onUpdate:order': (now: PlayerConfig[] | null) => (order.value = now) },
    global: { stubs: { Dartboard: Board } },
  });
  return order;
}

const throwDart = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('throwing for the bull', () => {
  it('takes a dart from each player in turn, and the closest throws first', async () => {
    const order = renderBullOff();
    expect(screen.getByText(/ann, throw at the bull/i)).toBeDefined();
    await throwDart('near miss');
    expect(screen.getByText(/bob, throw at the bull/i)).toBeDefined();
    await throwDart('closer');
    expect(screen.getByText(/bob is closest, and throws first/i)).toBeDefined();
    expect(order.value?.map((player) => player.id)).toEqual(['bob', 'ann']);
    expect(screen.getByText('30 mm')).toBeDefined();
  });

  it('has the tied players throw again after two darts in the bull', async () => {
    const order = renderBullOff();
    await throwDart('in the bull');
    await throwDart('in the bull');
    expect(screen.getByText(/a tie: ann and bob throw again/i)).toBeDefined();
    expect(order.value).toBeNull();
    await throwDart('near miss');
    await throwDart('in the bull');
    expect(order.value?.map((player) => player.id)).toEqual(['bob', 'ann']);
  });

  it('takes a dart back, and the decision with it', async () => {
    const order = renderBullOff();
    await throwDart('near miss');
    await throwDart('closer');
    await fireEvent.click(screen.getByRole('button', { name: /undo the last dart/i }));
    expect(order.value).toBeNull();
    expect(screen.getByText(/bob, throw at the bull/i)).toBeDefined();
  });
});
