import { describe, expect, it } from 'vitest';

import { proposalsBeside } from './proposals.js';

describe('proposals from the model', () => {
  const at = (x: number, y: number) => ({ board: { x, y } });

  it('drops detections of darts that are already marked', () => {
    const carried = [at(1, 0)];
    expect(proposalsBeside([at(3, 0), at(60, 40)], carried)).toEqual([at(60, 40)]);
  });

  it('lets each marked dart claim only one detection, the nearest', () => {
    const carried = [at(1, 0)];
    expect(proposalsBeside([at(1.5, 0), at(5, 0)], carried)).toEqual([at(5, 0)]);
  });

  it('finds the third dart of a tight treble 20, a few millimetres from the other two', () => {
    const carried = [at(-4, 103), at(1, 103)];
    const found = [at(-3.6, 103.4), at(1.3, 102.8), at(5, 103.5)];
    expect(proposalsBeside(found, carried)).toEqual([at(5, 103.5)]);
  });

  it('keeps everything when nothing is carried', () => {
    expect(proposalsBeside([at(0, 100)], [])).toHaveLength(1);
  });
});
