import { parseHit } from '../../src/board/notation.js';
import { dartEvent, type MatchEvent } from '../../src/game/x01.js';

export const ann = { id: 'ann', name: 'Ann' };
export const bob = { id: 'bob', name: 'Bob' };
export const cat = { id: 'cat', name: 'Cat' };

/** Throws the given darts in order, `T20 S5 MISS …`, one event each. */
export function darts(...notation: string[]): MatchEvent[] {
  return notation.map((text, index) => {
    const hit = parseHit(text);
    if (!hit) throw new Error(`bad test notation: ${text}`);
    return dartEvent(hit, { id: `d${index}`, ts: 1_700_000_000_000 + index * 1000 });
  });
}

/** A visit of three misses, for a player whose turn does not matter. */
export const misses = (visits = 1) => Array.from({ length: visits * 3 }, () => 'MISS');
