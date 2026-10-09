/**
 * A module's part of the app's state, as the module sees it: what it holds
 * now, and a way to change some of it.
 *
 * The modules beside this file (the match, the players, the settings and the
 * lobby session) hold no state of their own. It lives in their Pinia stores
 * (stores.ts), which screens and tests read and write directly, so a copy kept
 * anywhere else would drift from it; each store hands its module a slice of
 * its refs (refSlice.ts). `get` is read at the moment of use, never kept:
 * after an await, or in a callback from a connection, the state may have
 * moved on.
 */
export interface Slice<S> {
  get(): S;
  set(patch: Partial<S>): void;
}
