import { act, render, screen } from '@testing-library/react';
import { CALIBRATION_BOARD_POINTS, dartEvent, reduceMatch, type DartSource, type Hit, type Point } from '@treblewise/core';
import { useEffect, useMemo, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameVisitState } from '../game/gameVisit.js';
import { useGameVisit } from '../game/useGameVisit.js';
import { useMatchStore } from '../store/match.js';
import type { CapturedFrame } from '../storage/frames.js';
import type { GrabbedFrame } from '../vision/camera.js';
import { GameCamera } from './GameCamera.js';

const WIDTH = 640;
const HEIGHT = 480;

const hooks = vi.hoisted(() => ({
  settle: undefined as ((frame: GrabbedFrame, thumbnail?: Uint8Array, before?: Uint8Array | null) => void) | undefined,
  /** What the model finds on the next photograph, in board millimetres. */
  found: [] as { x: number; y: number }[],
  /** Whether the camera was last asked to pause. */
  paused: false,
  /** What "take a photograph now" gives back. */
  capture: null as GrabbedFrame | null,
}));

vi.mock('../vision/useCamera.js', () => ({
  useCamera: (options: { onSettle?: typeof hooks.settle; paused?: boolean }) => {
    hooks.settle = options.onSettle;
    hooks.paused = options.paused === true;
    return {
      videoRef: { current: null },
      ready: true,
      error: null,
      width: WIDTH,
      height: HEIGHT,
      moving: false,
      settles: 0,
      motion: 0,
      change: 0,
      quality: null,
      capture: async () => hooks.capture,
      sampleThumbnail: () => null,
    };
  },
}));

vi.mock('../vision/camera.js', () => ({ cameraSupported: () => true, THUMB_SIZE: 64 }));

vi.mock('../vision/detector.js', () => ({
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
vi.mock('../storage/frames.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage/frames.js')>()),
  putFrame: async (frame: CapturedFrame) => {
    saved.frames.push(frame);
  },
}));

// Every candidate changed: the change gate is tested on its own. What it is
// asked to compare is recorded, to check which photograph a read compares against.
const gate = vi.hoisted(() => ({
  changesAt: vi.fn(async (...args: unknown[]) => (args[5] as unknown[]).map(() => 50)),
}));
vi.mock('../vision/changeGate.js', () => ({ NEW_DART_CHANGE: 5, changesAt: gate.changesAt }));

/** The board-region thumbnail of the empty board, as stored at calibration. */
const EMPTY = new Uint8Array(64 * 64).fill(120);
/** The same board with darts in it. */
const DARTS = EMPTY.map((value, index) => (index % 64 > 30 && index % 64 < 36 && index < 40 * 64 ? 40 : value));

const photo = (content = 'x'): GrabbedFrame => ({ jpeg: new Blob([content], { type: 'image/jpeg' }), width: WIDTH, height: HEIGHT });

async function settle(thumbnail: Uint8Array = DARTS, content = 'x'): Promise<GrabbedFrame> {
  const frame = photo(content);
  await act(async () => {
    hooks.settle!(frame, thumbnail, null);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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
  /** The game visit's state, and opening its report the way the game does. */
  const game = { state: null as GameVisitState | null, openReport: () => undefined as void };

  /**
   * The camera as the game screen wires it, on a match of these darts: Ann's
   * first visit, thrown in full at three. The darts the game visit enters are
   * recorded rather than entered.
   */
  function Harness({ darts }: { darts: TestDart[] }) {
    const snapshot = useMemo(
      () =>
        reduceMatch(
          config,
          darts.map((dart) =>
            dartEvent(dart.hit, { id: dart.id, ts: 0, source: dart.source ?? 'manual', ...(dart.pos ? { pos: dart.pos } : {}) }),
          ),
        ),
      [darts],
    );
    const autoscoring = useMatchStore((s) => s.settings.keepFrames && s.settings.autoscoreGames);
    const calibration = useMatchStore((s) => s.settings.calibration);
    const { gameVisit, state, watcher } = useGameVisit(
      { snapshot, autoscoring, calibration },
      { throwDart: (hit, options) => (options.call ? onAutoDart(hit, options.pos!, options.confidence!) : onMissed(hit)) },
    );
    useEffect(() => gameVisit.listen((signal) => signal === 'turn-passed' && onTurnPassed()), [gameVisit]);
    const [report, setReport] = useState<GrabbedFrame | null>(null);
    const openReport = () => {
      if (state.reportable && state.photo) setReport(state.photo);
    };
    game.state = state;
    game.openReport = openReport;
    return (
      <GameCamera
        matchId="m"
        gameVisit={gameVisit}
        watcher={watcher}
        canThrow
        report={report}
        onReport={openReport}
        onCloseReport={() => setReport(null)}
        onCorrect={() => undefined}
      />
    );
  }

  const camera = (darts: TestDart[] = []) => <Harness darts={darts} />;

  beforeEach(async () => {
    onAutoDart.mockReset();
    onMissed.mockReset();
    onTurnPassed.mockReset();
    hooks.found = [];
    const { calibrate } = await import('../storage/frames.js');
    const imagePoints = [
      { x: 320, y: 60 },
      { x: 500, y: 240 },
      { x: 320, y: 420 },
      { x: 140, y: 240 },
    ];
    const calibration = calibrate(imagePoints, CALIBRATION_BOARD_POINTS, { width: WIDTH, height: HEIGHT })!;
    useMatchStore.setState((state) => ({
      mode: 'solo',
      remoteStream: null,
      settings: {
        ...state.settings,
        keepFrames: true,
        autoscoreGames: true,
        calibration: { ...calibration, ts: 1, reference: Array.from(EMPTY) },
      },
    }));
  });

  /** Renders, and waits for the model to load. */
  async function start(darts: TestDart[] = []) {
    const view = render(camera(darts));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return view;
  }

  it('enters the dart it reads, with where it landed', async () => {
    await start();
    hooks.found = [{ x: 0, y: 103 }];
    await settle();
    expect(onAutoDart).toHaveBeenCalledTimes(1);
    expect(onAutoDart.mock.calls[0]![1]).toEqual({ x: 0, y: 103 });
  });

  it('reads the second dart beside the first, not the first again', async () => {
    const view = await start([{ id: 'a', hit: T20, pos: { x: 0, y: 103 } }]);
    view.rerender(camera([{ id: 'a', hit: T20, pos: { x: 0, y: 103 } }]));
    hooks.found = [
      { x: 0.4, y: 103.1 },
      { x: 5, y: 103 },
    ];
    await settle();
    expect(onAutoDart).toHaveBeenCalledTimes(1);
    expect(onAutoDart.mock.calls[0]![1]).toEqual({ x: 5, y: 103 });
  });

  it('reads nothing while the last visit is being pulled out, and again once the board is empty', async () => {
    const thrown = [
      { id: 'a', hit: T20, pos: { x: 0, y: 103 } },
      { id: 'b', hit: T20, pos: { x: 5, y: 103 } },
      { id: 'c', hit: T20, pos: { x: -5, y: 103 } },
    ];
    await start(thrown);
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
    const view = await start(two);
    await settle(EMPTY);
    expect(onMissed).toHaveBeenCalledTimes(1);
    expect(onTurnPassed).toHaveBeenCalledTimes(1);

    // The missing dart is entered and the visit ends; its darts are already
    // out, so the next dart thrown is read straight away.
    view.rerender(camera([...two, { id: 'c', hit: { sector: 0, ring: 'miss', value: 0 } }]));
    hooks.found = [{ x: 30, y: -50 }];
    await settle();
    expect(onAutoDart).toHaveBeenCalledTimes(1);
  });

  it('reports on the photograph of the visit, not the hand that came after, and pauses the camera meanwhile', async () => {
    useMatchStore.setState((state) => ({ settings: { ...state.settings, autoscoreGames: false } }));
    const shownBlobs: Blob[] = [];
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      shownBlobs.push(blob as Blob);
      return 'blob:test';
    };
    URL.revokeObjectURL = () => undefined;

    const view = await start();
    const withTheDart = await settle(DARTS, 'with the dart');
    const dart = { id: 'a', hit: T20, pos: { x: 0, y: 103 } };
    view.rerender(camera([dart]));
    await settle(DARTS, 'a hand');

    expect(hooks.paused).toBe(false);
    await act(async () => {
      screen.getByRole('button', { name: /report/i }).click();
    });
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(shownBlobs.at(-1)).toBe(withTheDart.jpeg);
    expect(hooks.paused).toBe(true);
  });

  it('opens the report when the game asks, once the game visit says it can', async () => {
    useMatchStore.setState((state) => ({ settings: { ...state.settings, autoscoreGames: false } }));
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => undefined;
    const dart = { id: 'a', hit: T20, pos: { x: 0, y: 103 } };
    render(camera([dart]));
    expect(game.state!.reportable).toBe(false); // no photograph yet
    await settle();
    expect(game.state!.reportable).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      game.openReport();
    });
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('photographs a dart entered by hand, so the report shows it', async () => {
    useMatchStore.setState((state) => ({ settings: { ...state.settings, autoscoreGames: false } }));
    const shownBlobs: Blob[] = [];
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      shownBlobs.push(blob as Blob);
      return 'blob:test';
    };
    URL.revokeObjectURL = () => undefined;
    const two = [
      { id: 'a', hit: T20, pos: { x: 0, y: 103 }, source: 'auto' as const },
      { id: 'b', hit: T20, pos: { x: 5, y: 103 }, source: 'auto' as const },
    ];
    const view = await start(two);
    await settle(DARTS, 'two darts');

    // The third went in behind the others: nothing settled, so it is entered by hand.
    const now = photo('three darts');
    hooks.capture = now;
    await act(async () => {
      view.rerender(camera([...two, { id: 'c', hit: T20, source: 'manual' }]));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      screen.getByRole('button', { name: /mark where they landed/i }).click();
    });
    expect(shownBlobs.at(-1)).toBe(now.jpeg);
    hooks.capture = null;
  });

  it('keeps a report for training only if every dart has a mark, and marks the autoscorer’s as the model’s', async () => {
    useMatchStore.setState((state) => ({ settings: { ...state.settings, autoscoreGames: false } }));
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => undefined;
    saved.frames = [];
    const read = [
      { id: 'a', hit: T20, pos: { x: 0, y: 103 }, source: 'auto' as const },
      { id: 'b', hit: T20, pos: { x: 5, y: 103 }, source: 'auto' as const },
    ];
    const view = await start(read);
    await settle();
    const keypad = { id: 'c', hit: T20, source: 'manual' as const };
    await act(async () => {
      view.rerender(camera([...read, keypad]));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The keypad dart is left without a mark: nothing is kept.
    await act(async () => {
      screen.getByRole('button', { name: /mark where they landed/i }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: /save report/i }).click();
    });
    expect(saved.frames).toHaveLength(0);
    expect(screen.getByText(/not kept for training/i)).toBeDefined();

    // Without the keypad dart, every dart is marked: kept, the model's marks as the model's.
    view.rerender(camera(read));
    await act(async () => {
      screen.getByRole('button', { name: /report/i }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: /save report/i }).click();
    });
    expect(saved.frames).toHaveLength(1);
    expect(saved.frames[0]!.darts.every((dart) => dart.by === 'model')).toBe(true);
    expect(saved.frames[0]!.model).toBe('test-model');
    // The autoscorer's marks, let stand by a person: accepted already.
    expect(saved.frames[0]!.reviewed).toBe(true);
  });

  it('keeps a dart tapped on the drawn board for Review to confirm, when its mark is left where it was', async () => {
    useMatchStore.setState((state) => ({ settings: { ...state.settings, autoscoreGames: false } }));
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => undefined;
    saved.frames = [];
    const tapped = [
      { id: 'a', hit: T20, pos: { x: 0, y: 103 }, source: 'auto' as const },
      { id: 'b', hit: T20, pos: { x: 5, y: 103 }, source: 'manual' as const },
    ];
    await start(tapped);
    await settle();
    await act(async () => {
      screen.getByRole('button', { name: /report/i }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: /save report/i }).click();
    });
    expect(saved.frames).toHaveLength(1);
    expect(saved.frames[0]!.reviewed).toBeUndefined();
  });

  it('compares a new photograph with the visit photo, not a settle that entered nothing', async () => {
    hooks.found = [{ x: 0, y: 103 }];
    const view = await start();
    const withTheDart = await settle(DARTS, 'with the dart');
    expect(onAutoDart).toHaveBeenCalledTimes(1);
    const dart = { id: 'a', hit: T20, pos: { x: 0, y: 103 }, source: 'auto' as const };
    view.rerender(camera([dart]));

    // A hand reaching in: the model sees only the dart in the board, so nothing is entered.
    await settle(DARTS, 'a hand');
    expect(onAutoDart).toHaveBeenCalledTimes(1);

    gate.changesAt.mockClear();
    hooks.found = [
      { x: 0, y: 103 },
      { x: 5, y: 103 },
    ];
    await settle(DARTS, 'the second dart');
    expect(gate.changesAt).toHaveBeenCalledTimes(1);
    expect(gate.changesAt.mock.calls[0]![0]).toBe(withTheDart.jpeg);
  });

  it('compares with the photograph taken when a dart was entered by hand', async () => {
    const view = await start();
    await settle(DARTS, 'before the dart');
    // Tapped on the drawn board: it has a position, and the camera photographs it.
    const tapped = photo('the tapped dart');
    hooks.capture = tapped;
    await act(async () => {
      view.rerender(camera([{ id: 'a', hit: T20, pos: { x: 0, y: 103 }, source: 'manual' }]));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    hooks.capture = null;

    gate.changesAt.mockClear();
    hooks.found = [
      { x: 0, y: 103 },
      { x: 5, y: 103 },
    ];
    await settle(DARTS, 'the second dart');
    expect(gate.changesAt).toHaveBeenCalledTimes(1);
    expect(gate.changesAt.mock.calls[0]![0]).toBe(tapped.jpeg);
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
