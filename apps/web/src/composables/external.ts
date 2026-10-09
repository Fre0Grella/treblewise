/**
 * The state of a plain module (the board watcher, the game visit, the marking
 * session) as a Vue ref. Each module has `state()` and `subscribe()`, returns
 * the same state object until something changes, and holds things Vue must
 * not wrap (photographs, live connections): so a shallow ref, replaced on
 * every change, and nothing deeper.
 */

import { markRaw, onScopeDispose, shallowRef, type ShallowRef } from 'vue';

export interface External<S> {
  state(): S;
  subscribe(listener: () => void): () => void;
}

export function useExternal<S>(module: External<S>): ShallowRef<S> {
  const state = shallowRef(module.state());
  const stop = module.subscribe(() => {
    state.value = module.state();
  });
  onScopeDispose(stop);
  return state;
}

/** A module Vue holds on to but never makes reactive. */
export function raw<T extends object>(module: T): T {
  return markRaw(module);
}
