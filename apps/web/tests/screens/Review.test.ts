import { fireEvent, screen } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CapturedFrame, LabelledDart } from '@/storage/frames.js';
import { filterFrames, markedBy, modelsWithMarks } from '@/storage/review.js';
import { renderAt } from '../support/renderAt.js';

/** An in-memory stand-in for the photograph store. */
const store = vi.hoisted(() => ({ frames: [] as CapturedFrame[] }));

vi.mock('@/storage/frames.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/storage/frames.js')>()),
  // New objects on every read, as IndexedDB gives back.
  listFrames: async () =>
    [...store.frames]
      .sort((a, b) => b.ts - a.ts)
      .map((f) => ({ ...f, darts: f.darts.map((d) => ({ ...d, img: { ...d.img }, board: { ...d.board }, hit: { ...d.hit } })) })),
  putFrame: async (frame: CapturedFrame) => {
    store.frames = [...store.frames.filter((f) => f.id !== frame.id), frame];
  },
  deleteFrame: async (id: string) => {
    store.frames = store.frames.filter((f) => f.id !== id);
  },
}));

function dart(value: number, by?: 'model'): LabelledDart {
  return {
    img: { x: 100 + value, y: 100 },
    board: { x: value, y: 50 },
    hit: { sector: value, ring: 'single', value },
    ...(by ? { by } : {}),
  };
}

function frame(id: string, ts: number, darts: LabelledDart[], extra: Partial<CapturedFrame> = {}): CapturedFrame {
  return {
    id,
    ts,
    source: 'lab',
    width: 640,
    height: 480,
    jpeg: new Blob(['x'], { type: 'image/jpeg' }),
    calibration: {
      imagePoints: [],
      toImage: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      toBoard: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      error: 0,
      width: 640,
      height: 480,
    },
    darts,
    labelled: true,
    ...extra,
  };
}

async function press(name: RegExp) {
  await fireEvent.click(await screen.findByRole('button', { name }));
  // Saving and deleting read the store back, then move to another address.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('reviewing labelled photographs', () => {
  beforeEach(() => {
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => undefined;
    store.frames = [
      frame('person', 3, [dart(20), dart(5)]),
      frame('guess-a', 2, [dart(1, 'model')], { model: 'tips-v1' }),
      frame('guess-b', 1, [dart(7), dart(19, 'model')], { model: 'tips-v1' }),
    ];
  });

  it('finds the photographs a model marked', () => {
    expect(modelsWithMarks(store.frames)).toEqual([{ model: 'tips-v1', frames: 2 }]);
    expect(markedBy(store.frames, 'tips-v1').map((f) => f.id)).toEqual(['guess-a', 'guess-b']);
    expect(filterFrames(store.frames, 'model')).toHaveLength(2);
    expect(filterFrames(store.frames, 'unreviewed')).toHaveLength(3);
  });

  it('keeps Previous, Next and Back working after a photograph is confirmed', async () => {
    await renderAt('/review');
    const cards = await screen.findAllByRole('button', { name: /lab/i });
    await fireEvent.click(cards[0]!);
    await press(/looks right/i);

    // The next photograph is open, untouched: nothing should be held back.
    expect((await screen.findByRole('button', { name: /^next$/i })).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: /^previous$/i }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: /back to the list/i }).hasAttribute('disabled')).toBe(false);
    await press(/back to the list/i);
    expect(await screen.findAllByRole('button', { name: /lab/i })).toHaveLength(3);
  });

  it('deletes exactly the photographs with one model’s marks, after asking', async () => {
    await renderAt('/review');
    await press(/delete the 2 with marks from tips-v1/i);
    expect(store.frames).toHaveLength(3); // asked first

    await press(/really delete 2 photographs/i);
    expect(store.frames.map((f) => f.id)).toEqual(['person']);
  });

  it('saves an edited photograph as reviewed, and it stays that way in the export', async () => {
    await renderAt('/review');
    await press(/S20, S5/); // the card of the person's photograph
    await press(/remove mark 2/i);
    await press(/looks right — save/i);

    const saved = store.frames.find((f) => f.id === 'person')!;
    expect(saved.reviewed).toBe(true);
    expect(saved.darts.map((d) => d.hit.value)).toEqual([20]);

    // jsdom's Blob cannot be read as bytes, so the export gets a photograph
    // that can, and the zip is read back with FileReader.
    const { exportFrames } = await import('@/storage/frames.js');
    const readable = { ...saved, jpeg: { arrayBuffer: async () => new ArrayBuffer(4), size: 4 } as unknown as Blob };
    const blob = await exportFrames([readable]);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new TextDecoder().decode(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(blob);
    });
    // Stored, not deflated: labels.json is in the zip as plain text.
    const start = text.indexOf('{\n  "version"');
    const labels = JSON.parse(text.slice(start, text.indexOf('PK', start)));
    expect(labels.frames[0].reviewed).toBe(true);
    expect(labels.frames[0].darts).toHaveLength(1);
    expect(text).toContain('reviewed            true when a person opened the frame');
  });

  it('keeps a model’s name on a reviewed photograph only while its mark still stands', async () => {
    await renderAt('/review');
    await press(/^S1 /); // guess-a: one dart, the model's
    await press(/looks right — save/i);
    expect(store.frames.find((f) => f.id === 'guess-a')).toMatchObject({ reviewed: true, model: 'tips-v1' });

    // guess-b opens next: remove the model's mark, keep the person's.
    await press(/remove mark 2/i);
    await press(/looks right — save/i);
    const cleaned = store.frames.find((f) => f.id === 'guess-b')!;
    expect(cleaned.reviewed).toBe(true);
    expect(cleaned.model).toBeUndefined();
  });

  it('deletes one photograph after asking', async () => {
    await renderAt('/review');
    await press(/S20, S5/);
    await press(/delete this photo/i);
    expect(store.frames).toHaveLength(3);
    await press(/really delete it/i);
    expect(store.frames.map((f) => f.id).sort()).toEqual(['guess-a', 'guess-b']);
  });
});

describe('a photograph at its own address', () => {
  beforeEach(() => {
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => undefined;
    store.frames = [frame('person', 3, [dart(20), dart(5)])];
  });

  it('opens straight on the photograph the address names', async () => {
    await renderAt('/review/person');
    expect(await screen.findByRole('button', { name: /remove mark 2/i })).toBeDefined();
  });

  it('says so when the photograph is not on this device', async () => {
    await renderAt('/review/elsewhere');
    expect(await screen.findByText(/not on this device/i)).toBeDefined();
  });

  it('holds Back to the list while marks are unsaved', async () => {
    const { router } = await renderAt('/review/person');
    await press(/remove mark 2/i);
    expect(screen.getByRole('button', { name: /back to the list/i }).hasAttribute('disabled')).toBe(true);
    expect(router.currentRoute.value.path).toBe('/review/person');
  });
});
