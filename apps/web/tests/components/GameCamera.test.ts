import { fireEvent, render, screen } from '@testing-library/vue';
import { CALIBRATION_BOARD_POINTS, dartEvent, reduceMatch, type DartSource, type Hit, type Point } from '@treblewise/core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, nextTick, onScopeDispose, shallowRef, toValue, type MaybeRefOrGetter } from 'vue';
import { createMemoryHistory } from 'vue-router';

import { useGameVisit } from '@/composables/useGameVisit.js';
import type { GameVisitState } from '@/game/gameVisit.js';
import { createAppRouter } from '@/router/index.js';
import type { CapturedFrame } from '@/storage/frames.js';
import { useLobbyStore, useSettingsStore } from '@/store/stores.js';
import type { GrabbedFrame } from '@/vision/camera.js';
import GameCamera from '@/components/GameCamera.vue';

const WIDTH = 640;
const HEIGHT = 480;

const hooks = vi.hoisted(() => ({
  settle: undefined as ((frame: GrabbedFrame, thumbnail?: Uint8Array, before?: Uint8Array | null) => void) | undefined,
  /** What the model finds on the next photograph, in board millimetres. */
  found: [] as { x: number; y: number }[],
  /** Whether the camera is asked to pause, read when the test asks. */
  paused: (() => false) as () => boolean,
  /** What "take a photograph now" gives back. */
  capture: null as GrabbedFrame | null,
}));

vi.mock('@/composables/useCamera.js', async () => {
  const { ref: vueRef, shallowRef: vueShallowRef } = await import('vue');
  return {
    useCamera: (options: { onSettle?: typeof hooks.settle; paused?: MaybeRefOrGetter<boolean> }) => {
      hooks.settle = options.onSettle;
      hooks.paused = () => toValue(options.paused) === true;
      return {
        video: vueRef(null),
        ready: vueRef(true),
        error: vueRef(null),
        width: vueRef(WIDTH),
        height: vueRef(HEIGHT),
        moving: vueRef(false),
        settles: vueRef(0),
        motion: vueRef(0),
        change: vueRef(0),
        photo: vueShallowRef(null),
        quality: vueShallowRef(null),
        capture: async () => hooks.capture,
        sampleThumbnail: () => null,
      };
    },
  };
});

vi.mock('@/vision/camera.js', () => ({ cameraSupported: () => true, THUMB_SIZE: 64 }));

vi.mock('@/vision/detector.js', () => ({
  loadManifest: async () => ({ name: 'test-model', file: 'x.onnx', sha256: 'x' }),
  loadDetector: async () => ({
    manifest: { name: 'test-model', file: 'x.onnx', sha256: 'x' },
    detect: async () =>
      hooks.found.map((board) => ({
        img: { x: 320, y: 200 },
        board,
        hit: { sector: 20, ring: 'treble', value: 60 },
        confidence: 0.8,
      })),
  }),
}));

const saved = vi.hoisted(() => ({ frames: [] as CapturedFrame[] }));
vi.mock('@/storage/frames.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/storage/frames.js')>()),
  putFrame: async (frame: CapturedFrame) => {
    saved.frames.push(frame);
  },
}));

// Every candidate changed: the change gate is tested on its own. What it is
// asked to compare is recorded, to check which photograph a read compares against.
const gate = vi.hoisted(() => ({
  changesAt: vi.fn(async (...args: unknown[]) => (args[5] as unknown[]).map(() => 50)),
}));
vi.mock('@/vision/changeGate.js', () => ({ NEW_DART_CHANGE: 5, changesAt: gate.changesAt }));

/** The board-region thumbnail of the empty board, as stored at calibration. */
const EMPTY = new Uint8Array(64 * 64).fill(120);
/** The same board with darts in it. */
const DARTS = EMPTY.map((value, index) => (index % 64 > 30 && index % 64 < 36 && index < 40 * 64 ? 40 : value));

const photo = (content = 'x'): GrabbedFrame => ({ jpeg: new Blob([content], { type: 'image/jpeg' }), width: WIDTH, height: HEIGHT });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function settle(thumbnail: Uint8Array = DARTS, content = 'x'): Promise<GrabbedFrame> {
  const frame = photo(content);
  hooks.settle!(frame, thumbnail, null);
  await tick();
  await nextTick();
  return frame;
}

const T20: Hit = { sector: 20, ring: 'treble', value: 60 };

const config = {
  startScore: 501,
  inRule: 'straight' as const,
  outRule: 'double' as const,
  legsPerSet: 1,
  setsToWin: 1,
  players: [
    { id: 'ann', name: 'Ann' },
    { id: 'bob', name: 'Bob' },
  ],
};

interface TestDart {
  id: string;
  hit: Hit;
  pos?: Point;
  source?: DartSource;
}

describe('the autoscorer in a game', () => {
  const onAutoDart = vi.fn<(hit: Hit, pos: Point, confidence: number) => void>();
  /** A dart entered because the darts came out before the visit was thrown in full. */
  const onMissed = vi.fn<(hit: Hit) => void>();
  const onTurnPassed = vi.fn<() => void>();
  /** The darts of the match, which the test changes as the game would. */
  const darts = shallowRef<TestDart[]>([]);
  /** The game visit's state, and opening its report the way the game does. */
  const game = { state: null as GameVisitState | null, openReport: () => undefined as void };

  /**
   * The camera as the game screen wires it, on a match of these darts. The
   * darts the game visit enters are recorded rather than entered.
   */
  const Harness = defineComponent(() => {
    const settings = useSettingsStore();
    const snapshot = computed(() =>
      reduceMatch(
        config,
        darts.value.map((dart) =>
          dartEvent(dart.hit, { id: dart.id, ts: 0, source: dart.source ?? 'manual', ...(dart.pos ? { pos: dart.pos } : {}) }),
        ),
      ),
    );
    const { gameVisit, state } = useGameVisit(
      {
        snapshot,
        autoscoring: () => settings.settings.keepFrames && settings.settings.autoscoreGames,
        calibration: () => settings.settings.calibration,
      },
      { throwDart: (hit, options) => (options.call ? onAutoDart(hit, options.pos!, options.confidence!) : onMissed(hit)) },
    );
    onScopeDispose(gameVisit.listen((signal) => signal === 'turn-passed' && onTurnPassed()));
    const report = shallowRef<GrabbedFrame | null>(null);
    const openReport = () => {
      if (state.value.reportable && state.value.photo) report.value = state.value.photo;
    };
    return () => {
      game.state = state.value;
      game.openReport = openReport;
      return h(GameCamera, {
        matchId: 'm',
        gameVisit,
        canThrow: true,
        report: report.value,
        onReport: openReport,
        onCloseReport: () => (report.value = null),
        onCorrect: () => undefined,
      });
    };
  });

  /** Renders, and waits for the model to load. */
  async function start(initial: TestDart[] = [], { autoscore = true } = {}) {
    darts.value = initial;
    const pinia = createPinia();
    setActivePinia(pinia);
    const { calibrate } = await import('@/storage/frames.js');
    const imagePoints = [
      { x: 320, y: 60 },
      { x: 500, y: 240 },
      { x: 320, y: 420 },
      { x: 140, y: 240 },
    ];
    const calibration = calibrate(imagePoints, CALIBRATION_BOARD_POINTS, { width: WIDTH, height: HEIGHT })!;
    const settings = useSettingsStore();
    settings.settings = {
      ...settings.settings,
      keepFrames: true,
      autoscoreGames: autoscore,
      calibration: { ...calibration, ts: 1, reference: Array.from(EMPTY) },
    };
    useLobbyStore().mode = 'solo';
    const router = createAppRouter(createMemoryHistory());
    const view = render(Harness, { global: { plugins: [pinia, router] } });
    await tick();
    await tick();
    return view;
  }

  /** The darts of the match change, as they do when one is entered. */
  async function enter(next: TestDart[]) {
    darts.value = next;
    await tick();
    await nextTick();
  }

  const fakeUrls = () => {
    const shown: Blob[] = [];
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      shown.push(blob as Blob);
      return 'blob:test';
    };
    URL.revokeObjectURL = () => undefined;
    return shown;
  };

  beforeEach(() => {
    onAutoDart.mockReset();
    onMissed.mockReset();
    onTurnPassed.mockReset();
    hooks.found = [];
    hooks.capture = null;
  });

  it('enters the dart it reads, with where it landed', async () => {
    await start();
    hooks.found = [{ x: 0, y: 103 }];
    await settle();
    expect(onAutoDart).toHaveBeenCalledTimes(1);
    expect(onAutoDart.mock.calls[0]![1]).toEqual({ x: 0, y: 103 });
  });

  it('reads the second dart beside the first, not the first again', async () => {
    await start([{ id: 'a', hit: T20, pos: { x: 0, y: 103 } }]);
    hooks.found = [
      { x: 0.4, y: 103.1 },
      { x: 5, y: 103 },
    ];
    await settle();
    expect(onAutoDart).toHaveBeenCalledTimes(1);
    expect(onAutoDart.mock.calls[0]![1]).toEqual({ x: 5, y: 103 });
  });

  it('reads nothing while the last visit is being pulled out, and again once the board is empty', async () => {
    await start([
      { id: 'a', hit: T20, pos: { x: 0, y: 103 } },
      { id: 'b', hit: T20, pos: { x: 5, y: 103 } },
      { id: 'c', hit: T20, pos: { x: -5, y: 103 } },
    ]);
    hooks.found = [{ x: 0, y: 103 }];
    await settle(); // a hand pulling the darts: all three still seen
    expect(onAutoDart).not.toHaveBeenCalled();

    expect(onTurnPassed).not.toHaveBeenCalled();
    await settle(EMPTY); // out: the next player is up
    expect(onAutoDart).not.toHaveBeenCalled();
    expect(onTurnPassed).toHaveBeenCalledTimes(1);

    hooks.found = [{ x: 30, y: -50 }];
    await settle();
    expect(onAutoDart).toHaveBeenCalledTimes(1);
  });

  it('ends a visit pulled out early: the darts not in the board missed it', async () => {
    const two = [
      { id: 'a', hit: T20, pos: { x: 0, y: 103 } },
      { id: 'b', hit: T20, pos: { x: 5, y: 103 } },
    ];
    await start(two);
    await settle(EMPTY);
    expect(onMissed).toHaveBeenCalledTimes(1);
    expect(onTurnPassed).toHaveBeenCalledTimes(1);

    // The missing dart is entered and the visit ends; its darts are already
    // out, so the next dart thrown is read straight away.
    await enter([...two, { id: 'c', hit: { sector: 0, ring: 'miss', value: 0 } }]);
    hooks.found = [{ x: 30, y: -50 }];
    await settle();
    expect(onAutoDart).toHaveBeenCalledTimes(1);
  });

  it('reports on the photograph of the visit, not the hand that came after, and pauses the camera meanwhile', async () => {
    const shown = fakeUrls();
    await start([], { autoscore: false });
    const withTheDart = await settle(DARTS, 'with the dart');
    await enter([{ id: 'a', hit: T20, pos: { x: 0, y: 103 } }]);
    await settle(DARTS, 'a hand');

    expect(hooks.paused()).toBe(false);
    await fireEvent.click(screen.getByRole('button', { name: /report/i }));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(shown.at(-1)).toBe(withTheDart.jpeg);
    expect(hooks.paused()).toBe(true);
  });

  it('opens the report when the game asks, once the game visit says it can', async () => {
    fakeUrls();
    await start([{ id: 'a', hit: T20, pos: { x: 0, y: 103 } }], { autoscore: false });
    expect(game.state!.reportable).toBe(false); // no photograph yet
    await settle();
    expect(game.state!.reportable).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();

    game.openReport();
    await nextTick();
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('photographs a dart entered by hand, so the report shows it', async () => {
    const shown = fakeUrls();
    const two = [
      { id: 'a', hit: T20, pos: { x: 0, y: 103 }, source: 'auto' as const },
      { id: 'b', hit: T20, pos: { x: 5, y: 103 }, source: 'auto' as const },
    ];
    await start(two, { autoscore: false });
    await settle(DARTS, 'two darts');

    // The third went in behind the others: nothing settled, so it is entered by hand.
    const now = photo('three darts');
    hooks.capture = now;
    await enter([...two, { id: 'c', hit: T20, source: 'manual' }]);
    await fireEvent.click(screen.getByRole('button', { name: /mark where they landed/i }));
    expect(shown.at(-1)).toBe(now.jpeg);
  });

  it('keeps a report for training only if every dart has a mark, and marks the autoscorer’s as the model’s', async () => {
    fakeUrls();
    saved.frames = [];
    const read = [
      { id: 'a', hit: T20, pos: { x: 0, y: 103 }, source: 'auto' as const },
      { id: 'b', hit: T20, pos: { x: 5, y: 103 }, source: 'auto' as const },
    ];
    await start(read, { autoscore: false });
    await settle();
    await enter([...read, { id: 'c', hit: T20, source: 'manual' as const }]);

    // The keypad dart is left without a mark: nothing is kept.
    await fireEvent.click(screen.getByRole('button', { name: /mark where they landed/i }));
    await fireEvent.click(screen.getByRole('button', { name: /save report/i }));
    await tick();
    expect(saved.frames).toHaveLength(0);
    expect(screen.getByText(/not kept for training/i)).toBeDefined();

    // Without the keypad dart, every dart is marked: kept, the model's marks as the model's.
    await enter(read);
    await fireEvent.click(screen.getByRole('button', { name: /report/i }));
    await fireEvent.click(screen.getByRole('button', { name: /save report/i }));
    await tick();
    expect(saved.frames).toHaveLength(1);
    expect(saved.frames[0]!.darts.every((dart) => dart.by === 'model')).toBe(true);
    expect(saved.frames[0]!.model).toBe('test-model');
    // The autoscorer's marks, let stand by a person: accepted already.
    expect(saved.frames[0]!.reviewed).toBe(true);
  });

  it('keeps a dart tapped on the drawn board for Review to confirm, when its mark is left where it was', async () => {
    fakeUrls();
    saved.frames = [];
    await start(
      [
        { id: 'a', hit: T20, pos: { x: 0, y: 103 }, source: 'auto' as const },
        { id: 'b', hit: T20, pos: { x: 5, y: 103 }, source: 'manual' as const },
      ],
      { autoscore: false },
    );
    await settle();
    await fireEvent.click(screen.getByRole('button', { name: /report/i }));
    await fireEvent.click(screen.getByRole('button', { name: /save report/i }));
    await tick();
    expect(saved.frames).toHaveLength(1);
    expect(saved.frames[0]!.reviewed).toBeUndefined();
  });

  // As the game played when it was tried on a real board: each photograph is
  // compared with the settle before it, whatever that showed.
  it('compares a new photograph with the settle before it, a hand included', async () => {
    hooks.found = [{ x: 0, y: 103 }];
    await start();
    await settle(DARTS, 'with the dart');
    expect(onAutoDart).toHaveBeenCalledTimes(1);
    await enter([{ id: 'a', hit: T20, pos: { x: 0, y: 103 }, source: 'auto' as const }]);

    // A hand reaching in: the model sees only the dart in the board, so nothing is entered.
    const hand = await settle(DARTS, 'a hand');
    expect(onAutoDart).toHaveBeenCalledTimes(1);

    gate.changesAt.mockClear();
    hooks.found = [
      { x: 0, y: 103 },
      { x: 5, y: 103 },
    ];
    await settle(DARTS, 'the second dart');
    expect(gate.changesAt).toHaveBeenCalledTimes(1);
    expect(gate.changesAt.mock.calls[0]![0]).toBe(hand.jpeg);
  });

  it('keeps the photograph of a dart entered by hand for the report, not for comparing', async () => {
    await start();
    const before = await settle(DARTS, 'before the dart');
    // Tapped on the drawn board: it has a position, and the camera photographs it.
    hooks.capture = photo('the tapped dart');
    await enter([{ id: 'a', hit: T20, pos: { x: 0, y: 103 }, source: 'manual' }]);
    hooks.capture = null;

    gate.changesAt.mockClear();
    hooks.found = [
      { x: 0, y: 103 },
      { x: 5, y: 103 },
    ];
    await settle(DARTS, 'the second dart');
    expect(gate.changesAt).toHaveBeenCalledTimes(1);
    expect(gate.changesAt.mock.calls[0]![0]).toBe(before.jpeg);
  });

  it('compares a photograph that waited behind a reading with the one just read', async () => {
    hooks.found = [
      { x: 0, y: 103 },
      { x: 5, y: 103 },
    ];
    await start([{ id: 'a', hit: T20, pos: { x: 0, y: 103 } }]);
    const first = await settle(DARTS, 'first');

    // Two settles before the first of them is read: the second waits.
    gate.changesAt.mockClear();
    const a = photo('a');
    const b = photo('b');
    hooks.settle!(a, DARTS, null);
    hooks.settle!(b, DARTS, null);
    await tick();
    await tick();
    await nextTick();
    expect(gate.changesAt).toHaveBeenCalledTimes(2);
    expect(gate.changesAt.mock.calls[0]![0]).toBe(first.jpeg);
    expect(gate.changesAt.mock.calls[0]![1]).toBe(a.jpeg);
    expect(gate.changesAt.mock.calls[1]![0]).toBe(a.jpeg);
    expect(gate.changesAt.mock.calls[1]![1]).toBe(b.jpeg);
  });

  it('leaves the visit to the player once a dart was entered by number', async () => {
    await start([{ id: 'a', hit: T20 }]);
    hooks.found = [
      { x: 0, y: 103 },
      { x: 30, y: -50 },
    ];
    await settle();
    expect(onAutoDart).not.toHaveBeenCalled();
  });
});

