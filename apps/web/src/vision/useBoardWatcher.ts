/**
 * The board watcher as a React hook: one watcher per mount, and its state as
 * React state. The watcher itself has no framework (boardWatcher.ts); this is
 * the only part the Vue port rewrites, as a composable.
 */

import { useState, useSyncExternalStore } from 'react';

import { createBoardWatcher, type BoardWatcher, type BoardWatcherState } from './boardWatcher.js';

export function useBoardWatcher(): { watcher: BoardWatcher; state: BoardWatcherState } {
  const [watcher] = useState(createBoardWatcher);
  const state = useSyncExternalStore(watcher.subscribe, watcher.state);
  return { watcher, state };
}
