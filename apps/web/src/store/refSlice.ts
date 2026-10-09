/**
 * A module's slice (slice.ts) over refs of a Pinia store: the state stays in
 * the store, and the module reads and writes it as before.
 *
 * Shallow refs, not deep reactivity. The state is replaced, never edited in
 * place (a new snapshot per dart, a new settings object per change), so a ref
 * per field is all the reactivity it needs; and deep proxies would break what
 * the modules rely on: a live connection or a media stream wrapped in a proxy
 * throws "Illegal invocation", and `state.get().pairing === pairing` is false
 * for a proxy of the same connection.
 */

import { shallowRef, type ShallowRef } from 'vue';

import type { Slice } from './slice.js';

export type Refs<S> = { [K in keyof S]: ShallowRef<S[K]> };

/** A shallow ref per field, holding the initial state. */
export function refsOf<S extends object>(initial: S): Refs<S> {
  return Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, shallowRef(value)])) as Refs<S>;
}

export function refSlice<S extends object>(refs: Refs<S>): Slice<S> {
  return {
    get() {
      return Object.fromEntries(Object.entries(refs).map(([key, ref]) => [key, (ref as ShallowRef<unknown>).value])) as S;
    },
    set(patch) {
      for (const [key, value] of Object.entries(patch)) {
        (refs[key as keyof S] as ShallowRef<unknown>).value = value;
      }
    },
  };
}
