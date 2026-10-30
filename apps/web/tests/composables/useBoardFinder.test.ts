import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';

import { STEP_DWELL_MS, useBoardFinder } from '@/composables/useBoardFinder.js';
import type { FinderResult, FindOptions } from '@/vision/findBoard.js';

const NOT_FOUND: FinderResult = { notFound: 'noRing' };

describe('useBoardFinder', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lights every step in turn, however fast the finder, then gives the result', async () => {
    const scope = effectScope();
    const finder = scope.run(() =>
      useBoardFinder(async (_jpeg: Blob, options: FindOptions) => {
        options.onStep?.('colours');
        options.onStep?.('wires');
        return NOT_FOUND;
      }),
    )!;
    let result: FinderResult | null | undefined;
    void finder.findIn(new Blob()).then((r) => (result = r));
    const seen: Array<number | null> = [finder.shown.value];
    for (let i = 0; i < 8; i += 1) {
      await vi.advanceTimersByTimeAsync(STEP_DWELL_MS);
      seen.push(finder.shown.value);
    }
    expect(seen.slice(0, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(finder.shown.value).toBeNull();
    expect(result).toEqual(NOT_FOUND);
    scope.stop();
  });

  it('gives nothing to a find that was cancelled, and stops showing it', async () => {
    const scope = effectScope();
    let answer: (result: FinderResult) => void = () => {};
    const finder = scope.run(() => useBoardFinder(() => new Promise((resolve) => (answer = resolve))))!;
    let result: FinderResult | null | undefined;
    void finder.findIn(new Blob()).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(STEP_DWELL_MS);
    finder.cancel();
    expect(finder.shown.value).toBeNull();
    answer(NOT_FOUND);
    await vi.advanceTimersByTimeAsync(STEP_DWELL_MS * 10);
    expect(result).toBeNull();
    scope.stop();
  });

  it('says the photograph was unreadable when the finder fails', async () => {
    const scope = effectScope();
    const finder = scope.run(() => useBoardFinder(async () => Promise.reject(new Error('no'))))!;
    let result: FinderResult | null | undefined;
    void finder.findIn(new Blob()).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(STEP_DWELL_MS * 10);
    expect(result).toEqual({ notFound: 'unreadable' });
    scope.stop();
  });
});
