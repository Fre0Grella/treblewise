import { hit, parseHit } from '@treblewise/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { strings } from '../i18n/index.js';
import { deleteMatch, getMatch, listMatches, putMatch } from '../storage/db.js';
import type { Slice } from './slice.js';
import { createMatches, loadMatches, type MatchesState } from './matches.js';

const config = {
  startScore: 501,
  inRule: 'straight' as const,
  outRule: 'double' as const,
  legsPerSet: 1,
  setsToWin: 1,
  players: [
    { id: 'ann', name: 'Ann' },
    { id: 'bob', name: 'Bob' },
  ],
};

function held(): Slice<MatchesState> {
  let state: MatchesState = { match: null, snapshot: null, history: [] };
  return { get: () => state, set: (patch) => (state = { ...state, ...patch }) };
}

describe('the match in play', () => {
  beforeEach(async () => {
    for (const match of await listMatches(Number.MAX_SAFE_INTEGER)) await deleteMatch(match.id);
  });

  it('starts a match, saved and folded', async () => {
    const state = held();
    createMatches(state).start(config);

    const { match, snapshot } = state.get();
    expect(snapshot!.legs[0]!.remaining.ann).toBe(501);
    expect(await getMatch(match!.id)).toEqual(match);
  });

  it('returns the match after a dart, saved, with nothing to announce mid-visit', async () => {
    const state = held();
    const matches = createMatches(state);
    matches.start(config);

    const appended = matches.throwDart(hit(20, 'treble'), { pos: { x: 0, y: 103 } })!;
    expect(appended.match).toBe(state.get().match);
    expect(appended.snapshot).toBe(state.get().snapshot);
    expect(appended.calls).toEqual([]);
    expect(appended.snapshot.legs[0]!.visits[0]!.darts[0]!.pos).toEqual({ x: 0, y: 103 });
    expect((await getMatch(appended.match.id))!.events).toHaveLength(1);
  });

  it('announces a visit once it is thrown', () => {
    const matches = createMatches(held());
    matches.start(config);
    matches.throwDart(hit(20, 'treble'));
    matches.throwDart(hit(20, 'treble'));

    const { calls } = matches.throwDart(hit(20, 'treble'))!;
    expect(calls[0]).toBe(strings().caller.visit(180));
  });

  it('calls a dart as it goes in when asked, before the visit', () => {
    const matches = createMatches(held());
    matches.start(config);
    expect(matches.throwDart(hit(20, 'treble'), { source: 'auto', call: true })!.calls).toEqual([
      strings().caller.hit(hit(20, 'treble')),
    ]);

    matches.throwDart(hit(20, 'treble'), { source: 'auto', call: true });
    const { calls } = matches.throwDart(hit(20, 'treble'), { source: 'auto', call: true })!;
    expect(calls.slice(0, 2)).toEqual([strings().caller.hit(hit(20, 'treble')), strings().caller.visit(180)]);
  });

  it('announces nothing for a correction or an undo, even one that ends a visit', () => {
    const state = held();
    const matches = createMatches(state);
    matches.start(config);
    matches.throwDart(hit(20, 'treble'), { source: 'auto', confidence: 0.4 });
    matches.throwDart(hit(20, 'treble'));
    matches.throwDart(hit(20, 'treble'));

    const dartId = state.get().snapshot!.legs[0]!.visits[0]!.darts[0]!.id;
    const corrected = matches.correctDart(dartId, parseHit('S20')!)!;
    expect(corrected.calls).toEqual([]);
    expect(corrected.snapshot.legs[0]!.remaining.ann).toBe(361);

    const undone = matches.undo()!;
    expect(undone.calls).toEqual([]);
    expect(undone.snapshot.legs[0]!.remaining.ann).toBe(321);
  });

  it('has nothing to append to without a match, or once it is won', () => {
    const state = held();
    const matches = createMatches(state);
    expect(matches.throwDart(hit(20, 'single'))).toBeNull();
    expect(matches.correctDart('x', hit(20, 'single'))).toBeNull();
    expect(matches.undo()).toBeNull();

    matches.start({ ...config, startScore: 40, players: [config.players[0]!] });
    expect(matches.undo()).toBeNull();
    matches.throwDart(hit(20, 'double'));
    expect(state.get().match!.finished).toBe(true);
    expect(matches.throwDart(hit(20, 'treble'))).toBeNull();
  });

  it('resumes a stored match from the history', async () => {
    const state = held();
    const matches = createMatches(state);
    matches.start(config);
    matches.throwDart(hit(20, 'treble'));
    const id = state.get().match!.id;
    state.set({ match: null, snapshot: null });

    await matches.refreshHistory();
    expect(matches.resume('nope')).toBe(false);
    expect(matches.resume(id)).toBe(true);
    expect(state.get().snapshot!.legs[0]!.remaining.ann).toBe(441);
  });

  it('removes a stored match, and lets go of it if it is in play', async () => {
    const state = held();
    const matches = createMatches(state);
    matches.start(config);
    const id = state.get().match!.id;

    await matches.remove(id);
    expect(state.get()).toMatchObject({ match: null, snapshot: null, history: [] });
    expect(await getMatch(id)).toBeUndefined();
  });

  it('loads the history with the unfinished match back in play', async () => {
    const state = held();
    const matches = createMatches(state);
    matches.start(config);
    matches.throwDart(hit(20, 'treble'));
    const id = state.get().match!.id;
    await putMatch({ ...state.get().match!, id: 'done', finished: true, updatedAt: Date.now() + 1 });

    const loaded = await loadMatches();
    expect(loaded.history.map((match) => match.id)).toEqual(['done', id]);
    expect(loaded.match!.id).toBe(id);
    expect(loaded.snapshot!.legs[0]!.remaining.ann).toBe(441);
  });
});
