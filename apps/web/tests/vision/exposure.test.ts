import { describe, expect, it, vi } from 'vitest';

import { clampExposure, exposureOf, setExposure } from '@/vision/exposure.js';

type Set = { exposureMode?: string; exposureCompensation?: number };

/**
 * A camera track as far as exposure goes: what it allows, what it is at, what
 * it was opened with. `takes` says whether it acts on a set of constraints;
 * by default it takes every one.
 */
function fakeTrack(capabilities: Record<string, unknown>, settings: Record<string, unknown> = {}, takes = (_: Set) => true) {
  const opened = { width: { ideal: 1920 }, height: { ideal: 1080 } };
  const now = { ...settings };
  return {
    getCapabilities: () => capabilities,
    getSettings: () => now,
    getConstraints: () => opened,
    applyConstraints: vi.fn(async (constraints: { advanced: Set[] }) => {
      const set = constraints.advanced[0]!;
      if (takes(set)) now.exposureCompensation = set.exposureCompensation;
    }),
  } as unknown as MediaStreamTrack & { applyConstraints: ReturnType<typeof vi.fn> };
}

const range = { min: -2, max: 2, step: 1 / 3 };

describe('exposureOf', () => {
  it('reads the range and the current setting', () => {
    expect(exposureOf(fakeTrack({ exposureCompensation: range }, { exposureCompensation: -1 }))).toEqual({ ...range, value: -1 });
  });

  it('is null for a camera a page cannot set (an iPhone, most webcams)', () => {
    expect(exposureOf(fakeTrack({ width: { min: 1, max: 1920 } }))).toBeNull();
    expect(exposureOf(fakeTrack({ exposureCompensation: { min: 0, max: 0, step: 0 } }))).toBeNull();
    expect(exposureOf(null)).toBeNull();
  });
});

describe('clampExposure', () => {
  it('keeps a value in range and on a step', () => {
    expect(clampExposure(5, range)).toBe(2);
    expect(clampExposure(-5, range)).toBe(-2);
    expect(clampExposure(-0.7, range)).toBeCloseTo(-2 / 3, 3);
  });
});

describe('setExposure', () => {
  it('keeps the constraints the camera was opened with, so it stays at 1080p', async () => {
    const track = fakeTrack({ exposureCompensation: range, exposureMode: ['manual', 'continuous'] });
    expect(await setExposure(track, -1)).toBe(true);
    expect(track.applyConstraints).toHaveBeenCalledWith({
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [{ exposureMode: 'continuous', exposureCompensation: -1 }],
    });
  });

  it('does nothing on a camera that cannot, and says it failed when the camera refuses', async () => {
    const cannot = fakeTrack({});
    expect(await setExposure(cannot, -1)).toBe(false);
    expect(cannot.applyConstraints).not.toHaveBeenCalled();

    const refuses = fakeTrack({ exposureCompensation: range });
    refuses.applyConstraints.mockRejectedValueOnce(new Error('OverconstrainedError'));
    expect(await setExposure(refuses, -1)).toBe(false);
  });

  it('reads the setting back, since a camera can pass it over without a word', async () => {
    const ignores = fakeTrack({ exposureCompensation: range }, { exposureCompensation: 0 }, () => false);
    expect(await setExposure(ignores, -1)).toBe(false);
  });

  it('asks again without the exposure mode when the camera will not take the two together', async () => {
    const track = fakeTrack(
      { exposureCompensation: range, exposureMode: ['continuous'] },
      { exposureCompensation: 0 },
      (set) => set.exposureMode === undefined,
    );
    expect(await setExposure(track, -1)).toBe(true);
    expect(track.applyConstraints).toHaveBeenCalledTimes(2);
    expect(track.getSettings()).toMatchObject({ exposureCompensation: -1 });
  });
});
