import { BULL, hit, type Hit, type PlayerConfig, type Point } from '@treblewise/core';
import { fireEvent, render, screen } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import BullOff from '@/components/order/BullOff.vue';
import type { Calibration } from '@/storage/types.js';
import { useSettingsStore } from '@/store/stores.js';

// A camera this browser can open, when a test says so.
const camera = vi.hoisted(() => ({ supported: false }));
vi.mock('@/vision/camera.js', async (original) => ({
  ...(await original<typeof import('@/vision/camera.js')>()),
  cameraSupported: () => camera.supported,
}));

const players: PlayerConfig[] = [
  { id: 'ann', name: 'Ann' },
  { id: 'bob', name: 'Bob' },
];

/** The view, as buttons that each throw one dart: where a tap would have put it. */
const darts: Record<string, { hit: Hit; pos: Point }> = {
  'near miss': { hit: hit(20, 'single'), pos: { x: 0, y: 30 } },
  'closer': { hit: hit(3, 'single'), pos: { x: 0, y: -20 } },
  'in the bull': { hit: BULL, pos: { x: 1, y: 1 } },
};
const View = defineComponent({
  emits: ['hit'],
  setup(_, { emit, slots }) {
    return () => [
      ...Object.entries(darts).map(([name, dart]) => h('button', { onClick: () => emit('hit', dart.hit, dart.pos) }, name)),
      slots.default?.(),
    ];
  },
});

function renderBullOff() {
  const order = ref<PlayerConfig[] | null>(null);
  render(BullOff, {
    props: { players, order: order.value, 'onUpdate:order': (now: PlayerConfig[] | null) => (order.value = now) },
    // The camera itself is the bull reader's tests' (tests/game/bullReader.test.ts).
    global: { stubs: { BullView: View, BullCamera: { template: '<p>camera</p>' } } },
  });
  return order;
}

const throwDart = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('throwing for the bull', () => {
  // No calibration in a fresh store: no camera, the darts are tapped in.
  beforeEach(() => setActivePinia(createPinia()));

  it('takes a dart from each player in turn, and the closest throws first', async () => {
    const order = renderBullOff();
    expect(screen.getByText(/ann, throw at the bull/i)).toBeDefined();
    await throwDart('near miss');
    expect(screen.getByText(/bob, throw at the bull/i)).toBeDefined();
    await throwDart('closer');
    expect(screen.getByText(/bob is closest, and throws first/i)).toBeDefined();
    expect(order.value?.map((player) => player.id)).toEqual(['bob', 'ann']);
    // Each player's card says how far their dart is from the bull.
    expect(screen.getByText('Ann').closest('li')?.textContent).toContain('30 mm');
    expect(screen.getByText('Bob').closest('li')?.textContent).toContain('20 mm');
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

  it('reads the darts with the camera by default, once the board has been found', async () => {
    camera.supported = true;
    try {
      const settings = useSettingsStore();
      settings.settings = {
        ...settings.settings,
        calibration: { width: 640, height: 480 } as Calibration,
        // The game camera off makes no difference here.
        keepFrames: false,
        autoscoreGames: false,
      };
      renderBullOff();
      const watching = screen.getByRole('switch', { name: /read the darts with the camera/i });
      expect(watching.getAttribute('aria-checked')).toBe('true');
      expect(screen.getByText('camera')).toBeDefined();
      // Thrown, not tapped: the camera reads it.
      expect(screen.getByText(/^ann, throw at the bull\.$/i)).toBeDefined();
    } finally {
      camera.supported = false;
    }
  });

  it('shows the camera switched off, saying why, before the board has been found', () => {
    camera.supported = true;
    try {
      renderBullOff();
      const watching = screen.getByRole('switch', { name: /read the darts with the camera/i });
      expect(watching.getAttribute('aria-checked')).toBe('false');
      expect(watching.hasAttribute('disabled')).toBe(true);
      expect(screen.getByText(/has not found the board yet/i)).toBeDefined();
    } finally {
      camera.supported = false;
    }
  });

  it('says to pull the darts out before the match, once it is decided', async () => {
    renderBullOff();
    await throwDart('near miss');
    await throwDart('closer');
    expect(screen.getByText(/pull the darts out before the first throw/i)).toBeDefined();
  });
});
