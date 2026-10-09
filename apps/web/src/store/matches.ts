/**
 * The match in play, and the matches stored: an event log in, a folded
 * snapshot out.
 *
 * This module never computes a rule. It appends events, asks
 * `@treblewise/core` what the match looks like now, and saves it. That split
 * is why the rules have tests and the UI does not need them. Nor does it make
 * a sound: appending says what there is to announce, and whoever is listening
 * (caller/hookup.ts) decides whether anything is said.
 */

import {
  reduceMatch,
  type DartSource,
  type Hit,
  type MatchEvent,
  type MatchSnapshot,
  type Point,
  type X01Config,
} from '@treblewise/core';

import { announce } from '../caller/announce.js';
import { strings } from '../i18n/index.js';
import { deleteMatch, listMatches, putMatch, type StoredMatch } from '../storage/db.js';

import type { Slice } from './slice.js';

export interface MatchesState {
  /** The match in play, if any, and what its log folds to. */
  match: StoredMatch | null;
  snapshot: MatchSnapshot | null;
  /** The stored matches, most recently played first. */
  history: StoredMatch[];
}

export interface ThrowOptions {
  pos?: Point;
  source?: DartSource;
  confidence?: number;
  frameRef?: string;
  /** Say this dart's score as it goes in: the autoscorer's darts are called one by one. */
  call?: boolean;
}

/** The match after a dart, a correction or an undo, and what to announce for it, in order. */
export interface Appended {
  match: StoredMatch;
  snapshot: MatchSnapshot;
  calls: string[];
}

export interface MatchesActions {
  /** Starts a match and saves it. */
  start(config: X01Config): void;
  /** Puts a stored match back in play; false when there is no such match. */
  resume(id: string): boolean;
  /** Deletes a stored match, the one in play included. */
  remove(id: string): Promise<void>;
  refreshHistory(): Promise<void>;
  /** Null when there is no match in play, or it is over. */
  throwDart(hit: Hit, options?: ThrowOptions): Appended | null;
  correctDart(dartId: string, hit: Hit, pos?: Point): Appended | null;
  /** Takes the last event back; null when there is none. */
  undo(): Appended | null;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/** The stored matches, with the one left unfinished back in play. */
export async function loadMatches(): Promise<MatchesState> {
  const history = await listMatches();
  const unfinished = history.find((m) => !m.finished && m.events.length > 0);
  return {
    history,
    match: unfinished ?? null,
    snapshot: unfinished ? reduceMatch(unfinished.config, unfinished.events) : null,
  };
}

export function createMatches(state: Slice<MatchesState>): MatchesActions {
  /** Applies a new event list: folds it and saves it. Nothing to announce yet. */
  const commit = (current: StoredMatch, events: MatchEvent[]): Appended => {
    const snapshot = reduceMatch(current.config, events);
    const match: StoredMatch = {
      ...current,
      events,
      updatedAt: Date.now(),
      finished: snapshot.winnerId !== null,
    };
    state.set({ match, snapshot });
    void putMatch(match);
    return { match, snapshot, calls: [] };
  };

  const refreshHistory = async () => {
    state.set({ history: await listMatches() });
  };

  return {
    start(config) {
      const match: StoredMatch = {
        id: newId(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        config,
        events: [],
        finished: false,
      };
      state.set({ match, snapshot: reduceMatch(config, []) });
      void putMatch(match);
    },

    resume(id) {
      const match = state.get().history.find((m) => m.id === id);
      if (!match) return false;
      state.set({ match, snapshot: reduceMatch(match.config, match.events) });
      return true;
    },

    async remove(id) {
      await deleteMatch(id);
      if (state.get().match?.id === id) state.set({ match: null, snapshot: null });
      await refreshHistory();
    },

    refreshHistory,

    throwDart(hit, options = {}) {
      const { match, snapshot } = state.get();
      if (!match || !snapshot || snapshot.current === null) return null;

      const event: MatchEvent = {
        type: 'dart.thrown',
        id: newId(),
        ts: Date.now(),
        hit,
        source: options.source ?? 'manual',
        ...(options.pos ? { pos: options.pos } : {}),
        ...(options.confidence !== undefined ? { confidence: options.confidence } : {}),
        ...(options.frameRef ? { frameRef: options.frameRef } : {}),
      };

      const next = commit(match, [...match.events, event]);
      const called = options.call ? [strings().caller.hit(hit)] : [];
      return { ...next, calls: [...called, ...announce(snapshot, next.snapshot)] };
    },

    // A correction and an undo announce nothing.
    correctDart(dartId, hit, pos) {
      const { match } = state.get();
      if (!match) return null;
      return commit(match, [
        ...match.events,
        {
          type: 'dart.corrected',
          id: newId(),
          ts: Date.now(),
          target: dartId,
          hit,
          source: 'manual',
          ...(pos ? { pos } : {}),
        },
      ]);
    },

    undo() {
      const { match } = state.get();
      if (!match || match.events.length === 0) return null;
      return commit(match, match.events.slice(0, -1));
    },
  };
}
