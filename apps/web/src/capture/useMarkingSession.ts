/**
 * The marking session as a React hook: one session, with its own board
 * watcher, per mount, and its state as React state. The session itself has no
 * framework (markingSession.ts); this is the only part the Vue port rewrites,
 * as a composable.
 */

import { useState, useSyncExternalStore } from 'react';

import { createMarkingSession, type MarkingSession, type MarkingSessionState } from './markingSession.js';

export function useMarkingSession(): { session: MarkingSession; state: MarkingSessionState } {
  const [session] = useState(() => createMarkingSession());
  const state = useSyncExternalStore(session.subscribe, session.state);
  return { session, state };
}
