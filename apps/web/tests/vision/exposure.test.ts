import { describe, expect, it, vi } from 'vitest';

import { clampExposure, exposureOf, setExposure } from '@/vision/exposure.js';

/** A camera track as far as exposure goes: what it allows, what it is at, what it was opened with. */
function fakeTrack(capabilities: Record<string, unknown>, settings: Record<string, unknown> = {}) {
  const opened = { width: { ideal: 1920 }, height: { ideal: 1080 } };
  return {
    getCapabilities: () => capabilities,
    getSettings: () => settings,
    getConstraints: () => opened,
    applyConstraints: vi.fn(async () => undefined),
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
});
