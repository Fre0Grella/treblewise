/**
 * Every game the app plays (issue #22), and the one way in: a config of any
 * of them, folded with its own rules.
 *
 * A stored match carries its game in `config.mode`; a match stored before
 * there were other games has none, and is X01.
 */

import { reduceAroundTheClock, type AroundTheClockConfig, type AroundTheClockSnapshot } from './aroundTheClock.js';
import { reduceCricket, type CricketConfig, type CricketSnapshot } from './cricket.js';
import { reduceKiller, type KillerConfig, type KillerSnapshot } from './killer.js';
import { reduceShanghai, type ShanghaiConfig, type ShanghaiSnapshot } from './shanghai.js';
import {
  reduceBobs27,
  reduceCountUp,
  reduceHalveIt,
  type Bobs27Config,
  type Bobs27Snapshot,
  type CountUpConfig,
  type CountUpSnapshot,
  type HalveItConfig,
  type HalveItSnapshot,
} from './training.js';
import { reduceMatch, type MatchEvent, type MatchSnapshot, type X01Config } from './x01.js';

export type GameMode = 'x01' | 'cricket' | 'aroundTheClock' | 'shanghai' | 'killer' | 'bobs27' | 'halveIt' | 'countUp';

/** In the order the setup offers them: the match games, then the drills. */
export const GAME_MODES: readonly GameMode[] = ['x01', 'cricket', 'aroundTheClock', 'shanghai', 'killer', 'bobs27', 'halveIt', 'countUp'];

/** One game long, whatever the setup says: the drills. */
export const TRAINING_MODES: readonly GameMode[] = ['bobs27', 'halveIt', 'countUp'];

export type ModeConfig =
  | CricketConfig
  | AroundTheClockConfig
  | ShanghaiConfig
  | KillerConfig
  | Bobs27Config
  | HalveItConfig
  | CountUpConfig;

export type GameConfig = X01Config | ModeConfig;

export type ModeSnapshot =
  | CricketSnapshot
  | AroundTheClockSnapshot
  | ShanghaiSnapshot
  | KillerSnapshot
  | Bobs27Snapshot
  | HalveItSnapshot
  | CountUpSnapshot;

export type GameSnapshot = MatchSnapshot | ModeSnapshot;

export const modeOf = (config: GameConfig): GameMode => config.mode ?? 'x01';

export const isX01 = (config: GameConfig): config is X01Config => modeOf(config) === 'x01';

export const isX01Snapshot = (snapshot: GameSnapshot): snapshot is MatchSnapshot => isX01(snapshot.config);

/** Legs needed to win the match: X01's sets aside, the legs of a set. */
export const legsToWin = (config: GameConfig): number => (isX01(config) ? config.legsPerSet : config.legsToWin);

/** Folds any game's log. */
export function reduceGame(config: GameConfig, events: readonly MatchEvent[]): GameSnapshot {
  switch (config.mode) {
    case undefined:
    case 'x01':
      return reduceMatch(config, events);
    case 'cricket':
      return reduceCricket(config, events);
    case 'aroundTheClock':
      return reduceAroundTheClock(config, events);
    case 'shanghai':
      return reduceShanghai(config, events);
    case 'killer':
      return reduceKiller(config, events);
    case 'bobs27':
      return reduceBobs27(config, events);
    case 'halveIt':
      return reduceHalveIt(config, events);
    case 'countUp':
      return reduceCountUp(config, events);
  }
}

/** Whether the game is over: won, drawn or ended. */
export const gameOver = (snapshot: GameSnapshot): boolean => snapshot.current === null;
