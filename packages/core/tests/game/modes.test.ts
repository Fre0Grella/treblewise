import { describe, expect, it } from 'vitest';

import { gameOver, isX01Snapshot, legsToWin, modeOf, reduceGame, type GameConfig } from '../../src/game/modes.js';
import { ann, bob, darts } from '../fixtures/modeDarts.js';

describe('reduceGame', () => {
  it('folds a match stored before there were other games as X01', () => {
    const config: GameConfig = { startScore: 501, inRule: 'straight', outRule: 'double', legsPerSet: 3, setsToWin: 1, players: [ann, bob] };
    const s = reduceGame(config, darts('T20'));
    expect(modeOf(config)).toBe('x01');
    expect(isX01Snapshot(s)).toBe(true);
    expect(legsToWin(config)).toBe(3);
    expect(s.current?.remaining).toBe(441);
  });

  it('folds every other game with its own rules', () => {
    const s = reduceGame({ mode: 'countUp', rounds: 1, legsToWin: 1, players: [ann] }, darts('T20', 'T20', 'T20'));
    expect(isX01Snapshot(s)).toBe(false);
    expect(gameOver(s)).toBe(true);
    expect(s.winnerId).toBe('ann');
  });

  it('ends a game early on a match.ended, won by whoever leads on legs', () => {
    const s = reduceGame({ mode: 'cricket', scoring: 'standard', legsToWin: 3, players: [ann, bob] }, [
      ...darts('T20'),
      { type: 'match.ended', id: 'end', ts: 2 },
    ]);
    expect(s.endedEarly).toBe(true);
    expect(s.winnerId).toBeNull();
    expect(gameOver(s)).toBe(true);
  });
});
