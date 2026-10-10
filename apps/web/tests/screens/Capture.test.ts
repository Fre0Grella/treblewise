import { CALIBRATION_BOARD_POINTS } from '@treblewise/core';
import { fireEvent, screen } from '@testing-library/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import type { CapturedFrame } from '@/storage/frames.js';
import { loadSettings } from '@/storage/db.js';
import { useLobbyStore, useSettingsStore } from '@/store/stores.js';
import { renderAt } from '../support/renderAt.js';
import type { GrabbedFrame } from '@/vision/camera.js';

const WIDTH = 640;
const HEIGHT = 480;

/** What the mocks expose to the test: the settle callback, and what was stored. */
const hooks = vi.hoisted(() => ({
  settle: undefined as ((frame: GrabbedFrame, thumbnail?: Uint8Array) => void) | undefined,
  stored: [] as CapturedFrame[],
  detectorLoads: 0,
  /** What the model finds on the next photograph, in board millimetres. */
  found: [{ x: 0, y: 103 }] as { x: number; y: number }[],
  /** The model throws on the next photograph instead. */
  fail: false,
  /** How much the photograph changed at each candidate since the last one of the visit (changeGate.ts). */
  change: 50,
  /** What "take a photograph now" gives back. */
  capture: null as GrabbedFrame | null,
}));

vi.mock('@/composables/useCamera.js', async () => {
  const { ref, shallowRef } = await import('vue');
  return {
    useCamera: (options: { onSettle?: (frame: GrabbedFrame, thumbnail?: Uint8Array) => void }) => {
      hooks.settle = options.onSettle;
      return {
        video: ref(null),
        ready: ref(true),
        error: ref(null),
        width: ref(640),
        height: ref(480),
        moving: ref(false),
        settles: ref(0),
        motion: ref(0),
        change: ref(0),
        photo: shallowRef(null),
        quality: shallowRef(null),
        capture: async () => hooks.capture,
        sampleThumbnail: () => null,
      };
    },
  };
});

vi.mock('@/vision/camera.js', () => ({ cameraSupported: () => true, THUMB_SIZE: 64 }));

// A model that finds whatever `hooks.found` says: one dart in the treble 20 unless a test changes it.
vi.mock('@/vision/detector.js', () => ({
  loadManifest: async () => ({ name: 'test-model', file: 'x.onnx', sha256: 'x' }),
  loadDetector: async () => {
    hooks.detectorLoads += 1;
    return {
    manifest: { name: 'test-model', file: 'x.onnx', sha256: 'x' },
    detect: async () => {
      if (hooks.fail) throw new Error('out of memory');
      return hooks.found.map((board) => ({
        img: { x: 320, y: 200 },
        board,
        hit: { sector: 20, ring: 'treble', value: 60 },
        confidence: 0.9,
      }));
    },
    };
  },
}));

vi.mock('@/vision/changeGate.js', () => ({
  NEW_DART_CHANGE: 5,
  changesAt: async (...args: unknown[]) => (args[5] as unknown[]).map(() => hooks.change),
}));

vi.mock('@/caller/caller.js', () => ({ caller: () => ({ say: () => undefined }), unlockCaller: () => undefined }));

vi.mock('@/storage/frames.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/storage/frames.js')>()),
  putFrame: async (frame: CapturedFrame) => {
    hooks.stored.push(frame);
  },
  countFrames: async () => ({ total: 0, labelled: 0, bytes: 0 }),
}));

function photo(): GrabbedFrame {
  return { jpeg: new Blob(['x'], { type: 'image/jpeg' }), width: WIDTH, height: HEIGHT };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function press(name: RegExp) {
  await fireEvent.click(await screen.findByRole('button', { name }));
  await tick();
  await nextTick();
}

/** The board-region thumbnail of the empty board, as stored at calibration. */
const EMPTY = new Uint8Array(64 * 64).fill(120);
/** The same board with darts in it. */
const DARTS = EMPTY.map((value, index) => (index % 64 > 30 && index % 64 < 36 && index < 40 * 64 ? 40 : value));

async function settle(thumbnail: Uint8Array = DARTS) {
  hooks.settle!(photo(), thumbnail);
  await tick(); // let the proposal land
  await nextTick();
}

describe('the capture lab saves only what a person confirmed', () => {
  beforeEach(async () => {
    hooks.stored = [];
    hooks.found = [{ x: 0, y: 103 }];
    hooks.fail = false;
    hooks.change = 50;
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => undefined;
    // Never a blind visit: the model proposes on every photograph here.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const { calibrate } = await import('@/storage/frames.js');
    const imagePoints = [
      { x: 320, y: 60 },
      { x: 500, y: 240 },
      { x: 320, y: 420 },
      { x: 140, y: 240 },
    ];
    const calibration = calibrate(imagePoints, CALIBRATION_BOARD_POINTS, { width: WIDTH, height: HEIGHT })!;
    hooks.detectorLoads = 0;
    await renderAt('/camera', () => {
      useLobbyStore().mode = 'solo';
      const settings = useSettingsStore();
      settings.settings = {
        ...settings.settings,
        keepPhotos: true,
        calibration: { ...calibration, ts: 1, reference: Array.from(EMPTY) },
      };
    });
    await press(/start camera/i);
    await press(/try it/i);
    // Nothing heavy is loaded until proposals are asked for.
    expect(hooks.detectorLoads).toBe(0);
    await press(/autoscorer proposes.*off/i);
    await screen.findByRole('button', { name: /autoscorer proposes.*: on/i });
    expect(hooks.detectorLoads).toBe(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never saves on a settle, even with a proposal on screen', async () => {
    await settle();
    expect(screen.getByRole('button', { name: /right — save it/i })).toBeDefined();

    // The board settles again (an arm, a hand reaching for a dart): nothing is
    // saved, and the new photograph waits.
    await settle();
    await settle();
    expect(hooks.stored).toEqual([]);
    expect(screen.getByText(/a newer photo is waiting/i)).toBeDefined();
  });

  it('asks before its first save while keeping photos is off, and saves once it is on', async () => {
    useSettingsStore().settings = { ...useSettingsStore().settings, keepPhotos: false };
    await settle();
    await press(/right — save it/i);
    expect(hooks.stored).toEqual([]);
    expect(screen.getByRole('alertdialog', { name: /saves photographs on this device/i })).toBeDefined();

    await press(/not now/i);
    expect(screen.queryByRole('alertdialog', { name: /saves photographs/i })).toBeNull();
    expect(hooks.stored).toEqual([]);
    expect(useSettingsStore().settings.keepPhotos).toBe(false);

    await press(/right — save it/i);
    await press(/turn it on and save/i);
    expect(hooks.stored).toHaveLength(1);
    expect(useSettingsStore().settings.keepPhotos).toBe(true);
    expect((await loadSettings()).keepPhotos).toBe(true);
    // Once on, a save does not ask.
    expect(screen.queryByRole('alertdialog', { name: /saves photographs/i })).toBeNull();
  });

  it('throws an unconfirmed proposal away when the photo is skipped', async () => {
    await settle();
    await press(/skip this photo/i);
    expect(hooks.stored).toEqual([]);
  });

  it('saves a proposal once a person says it is right, and marks it as the model’s', async () => {
    await settle();
    await press(/right — save it/i);

    expect(hooks.stored).toHaveLength(1);
    const [frame] = hooks.stored;
    expect(frame!.darts).toHaveLength(1);
    expect(frame!.darts[0]!.by).toBe('model');
    expect(frame!.model).toBe('test-model');
    expect(screen.getByText(/saved: 1 darts/i)).toBeDefined();
  });

  it('says so when the model looked and saw no new dart', async () => {
    hooks.found = [];
    await settle();
    expect(screen.getByText(/saw no new dart here/i)).toBeDefined();
  });

  it('says so when the model could not run, instead of looking switched off', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    hooks.fail = true;
    await settle();
    expect(screen.getByText(/could not read this photo/i)).toBeDefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it('proposes the second dart of a tight treble 20, right beside the first', async () => {
    await settle();
    await press(/right — save it/i);
    hooks.found = [
      { x: 0.3, y: 103.2 },
      { x: 4, y: 103 },
    ];
    await settle();
    await press(/right — save it/i);
    expect(hooks.stored[1]!.darts.map((dart) => dart.board)).toEqual([
      { x: 0, y: 103 },
      { x: 4, y: 103 },
    ]);
  });

  it('proposes nothing after a full visit until the darts are out', async () => {
    const visit = [
      { x: 0, y: 103 },
      { x: 4, y: 103 },
      { x: -4, y: 103 },
    ];
    for (let n = 1; n <= 3; n += 1) {
      hooks.found = visit.slice(0, n);
      await settle();
      await press(/right — save it/i);
    }
    expect(hooks.stored).toHaveLength(3);

    // The pull-out phase: said up front, before any photograph.
    expect(screen.getByText(/pull them all out/i)).toBeDefined();

    // A hand reaching for the darts: all three still in. Not opened at all, so
    // nobody is asked to tap a dart on it.
    await settle();
    expect(screen.queryByRole('button', { name: /right — save it/i })).toBeNull();
    expect(screen.queryByText(/tap the dart/i)).toBeNull();
    expect(screen.getByText(/pull them all out/i)).toBeDefined();

    // The darts are out: the phase ends without a photograph to mark, and the
    // next one thrown is proposed again.
    hooks.found = [];
    await settle(EMPTY);
    expect(screen.queryByText(/pull them all out/i)).toBeNull();
    expect(screen.getByText(/i am watching the board/i)).toBeDefined();
    hooks.found = [{ x: 20, y: -40 }];
    await settle();
    expect(screen.getByRole('button', { name: /right — save it/i })).toBeDefined();
  });

  it('does not propose a dart beside an old one where nothing changed', async () => {
    await settle();
    await press(/right — save it/i);
    // A phantom beside the first dart: the model is sure, the photograph says nothing landed.
    hooks.found = [
      { x: 0.3, y: 103.2 },
      { x: 4, y: 103 },
    ];
    hooks.change = 1;
    await settle();
    expect(screen.queryByRole('button', { name: /right — save it/i })).toBeNull();
    expect(screen.getByText(/saw no new dart here/i)).toBeDefined();
  });

  it('keeps a rejected proposal as a photograph with only the old darts', async () => {
    await settle();
    await press(/right — save it/i);
    hooks.found = [
      { x: 0, y: 103 },
      { x: 40, y: -40 },
    ];
    await settle();
    await press(/no new dart/i);
    expect(hooks.stored).toHaveLength(2);
    const [, rejected] = hooks.stored;
    expect(rejected!.darts.map((dart) => dart.board)).toEqual([{ x: 0, y: 103 }]);
    expect(rejected!.rejected).toEqual([{ img: { x: 320, y: 200 }, board: { x: 40, y: -40 } }]);
    expect(rejected!.model).toBe('test-model');
    // Still the same visit: the next photograph opens with the one dart.
    expect(screen.queryByText(/pull them all out/i)).toBeNull();
  });

  it('keeps a phantom on the empty board as a photograph with nothing in it', async () => {
    hooks.found = [{ x: 40, y: -40 }];
    await settle();
    await press(/no new dart/i);
    expect(hooks.stored).toHaveLength(1);
    expect(hooks.stored[0]!.darts).toEqual([]);
    expect(hooks.stored[0]!.rejected).toHaveLength(1);
    expect(screen.queryByText(/pull them all out/i)).toBeNull();
  });

  it('does not ask for a dart on a photograph of the empty board', async () => {
    hooks.found = [];
    await settle(EMPTY);
    expect(screen.queryByText(/tap the dart/i)).toBeNull();
    expect(screen.getByText(/i am watching the board/i)).toBeDefined();
  });

  it('takes an empty board mid-visit as an early pull, judged when the photograph opens', async () => {
    await settle();
    // The darts come out while the first dart's photograph is still on
    // screen: the empty board waits behind it, and only once the first dart
    // is saved is it an empty board with a dart in it.
    hooks.found = [];
    await settle(EMPTY);
    expect(screen.getByText(/a newer photo is waiting/i)).toBeDefined();
    await press(/right — save it/i);
    expect(screen.getByText(/i am watching the board/i)).toBeDefined();

    // The next dart starts a visit of its own: the first is not carried into it.
    hooks.found = [{ x: 20, y: -40 }];
    await settle();
    await press(/right — save it/i);
    expect(hooks.stored).toHaveLength(2);
    expect(hooks.stored[1]!.darts.map((dart) => dart.board)).toEqual([{ x: 20, y: -40 }]);
  });

  it('lets a person say the darts are out when the board does not look empty', async () => {
    for (const n of [1, 2, 3]) {
      hooks.found = [1, 2, 3].slice(0, n).map((k) => ({ x: k * 5, y: 103 }));
      await settle();
      await press(/right — save it/i);
    }
    await settle();
    await press(/i pulled the darts out/i);
    hooks.found = [{ x: 20, y: -40 }];
    await settle();
    expect(screen.getByRole('button', { name: /right — save it/i })).toBeDefined();
  });

  it('keeps a blind visit blind when its photograph is replaced', async () => {
    for (const n of [1, 2, 3]) {
      hooks.found = [1, 2, 3].slice(0, n).map((k) => ({ x: k * 5, y: 103 }));
      await settle();
      // Saving the third dart starts the next visit, which rolls blind...
      if (n === 3) vi.mocked(Math.random).mockReturnValue(0.1);
      await press(/right — save it/i);
    }
    hooks.found = [];
    await settle(EMPTY);
    // ...and stays blind through photographs that replace each other, however
    // the dice would fall now.
    vi.mocked(Math.random).mockReturnValue(0.99);
    hooks.found = [{ x: 20, y: -40 }];
    await settle();
    await settle();
    expect(screen.queryByRole('button', { name: /right — save it/i })).toBeNull();
    expect(screen.getByText(/this visit is yours to mark/i)).toBeDefined();
  });

  it('asks before leaving with marks that are not saved', async () => {
    await settle();
    await press(/^done$/i);
    expect(screen.getByRole('alertdialog')).toBeDefined();
    await press(/throw it away/i);
    expect(hooks.stored).toEqual([]);
  });
});

describe('finding the board', () => {
  // The four landmarks are dragged about in the screen's state. Kept there as
  // Vue proxies, they went into the calibration, and IndexedDB refused to
  // store it (DataCloneError): the calibration was lost at every reload, and
  // every report saved under it failed the same way.
  it('keeps a calibration that can be stored, and is there after a reload', async () => {
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => undefined;
    hooks.capture = photo();
    await renderAt('/camera', () => {
      useLobbyStore().mode = 'solo';
    });
    await press(/start camera/i);
    await press(/find the board/i);
    await press(/use this calibration/i);

    const calibration = useSettingsStore().settings.calibration!;
    expect(calibration.imagePoints).toHaveLength(4);
    expect(() => structuredClone(calibration)).not.toThrow();
    expect((await loadSettings()).calibration?.imagePoints).toHaveLength(4);
    hooks.capture = null;
  });
});
