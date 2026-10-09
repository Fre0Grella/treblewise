/**
 * The marking session as a composable: one session, with its own board
 * watcher, per capture lab, and its state as a ref. The session itself has no
 * framework (capture/markingSession.ts).
 */

import { createMarkingSession, type MarkingSessionDeps } from '../capture/markingSession.js';
import { raw, useExternal } from './external.js';

/** `deps` stand in for storage, speech and the watcher, in tests. */
export function useMarkingSession(deps?: MarkingSessionDeps) {
  const session = raw(createMarkingSession(deps));
  return { session, state: useExternal(session) };
}
