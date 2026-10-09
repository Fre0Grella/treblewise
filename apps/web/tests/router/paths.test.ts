import { describe, expect, it } from 'vitest';

import { PATHS, STATIC_PATHS, pathForOldHash } from '@/router/paths.js';

describe('pathForOldHash', () => {
  it.each([
    ['#/', '/'],
    ['#/play', '/start'],
    ['#/lobby', '/lobby'],
    ['#/review', '/review'],
    ['#/new', '/setup'],
    ['#/game', '/game'],
    ['#/history', '/history'],
    ['#/camera', '/camera'],
    ['#/pair-role', '/pair'],
    ['#/pair', '/pair/laptop'],
    ['#/phone', '/pair/phone'],
    ['#/stats', '/stats'],
  ])('sends an old bookmark %s to %s', (hash, path) => {
    expect(pathForOldHash(hash)).toBe(path);
  });

  it('leaves any other hash alone', () => {
    expect(pathForOldHash('#section')).toBeNull();
    expect(pathForOldHash('')).toBeNull();
  });
});

describe('STATIC_PATHS', () => {
  it('lists every address without a parameter, and none with one', () => {
    expect(STATIC_PATHS).toContain(PATHS.pairPhone);
    expect(STATIC_PATHS).not.toContain(PATHS.match);
    expect(STATIC_PATHS).not.toContain(PATHS.photo);
    expect(STATIC_PATHS).toHaveLength(Object.keys(PATHS).length - 2);
  });
});
