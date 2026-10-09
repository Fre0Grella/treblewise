import { describe, expect, it } from 'vitest';

import { proposalsBeside } from '@/vision/proposals.js';

describe('proposals from the model', () => {
  const at = (x: number, y: number) => ({ board: { x, y } });

  it('drops detections of darts that are already marked', () => {
    const inBoard = [at(1, 0)];
    expect(proposalsBeside([at(3, 0), at(60, 40)], inBoard)).toEqual([at(60, 40)]);
  });

  it('lets each marked dart claim only one detection, the nearest', () => {
    const inBoard = [at(1, 0)];
    expect(proposalsBeside([at(1.5, 0), at(5, 0)], inBoard)).toEqual([at(5, 0)]);
  });

  it('finds the third dart of a tight treble 20, a few millimetres from the other two', () => {
    const inBoard = [at(-4, 103), at(1, 103)];
    const found = [at(-3.6, 103.4), at(1.3, 102.8), at(5, 103.5)];
    expect(proposalsBeside(found, inBoard)).toEqual([at(5, 103.5)]);
  });

  it('keeps everything when no dart is in the board', () => {
    expect(proposalsBeside([at(0, 100)], [])).toHaveLength(1);
  });
});
