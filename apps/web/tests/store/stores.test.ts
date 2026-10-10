import { hit, parseHit } from '@treblewise/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPinia, setActivePinia } from 'pinia';

import { caller } from '@/caller/caller.js';
import { strings } from '@/i18n/index.js';
import { useMatchesStore, useSettingsStore } from '@/store/stores.js';

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

describe('the match store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('records darts and folds the match', () => {
    useMatchesStore().start(config);

    useMatchesStore().throwDart(hit(20, 'treble'), { pos: { x: 0, y: 103 } });
    useMatchesStore().throwDart(hit(20, 'treble'));
    useMatchesStore().throwDart(hit(1, 'single'));

    const snapshot = useMatchesStore().snapshot!;
    expect(snapshot.legs[0]!.remaining.ann).toBe(380);
    expect(snapshot.current!.playerId).toBe('bob');
    expect(useMatchesStore().match!.events).toHaveLength(3);

    // The position of the first dart survived into the log.
    const first = snapshot.legs[0]!.visits[0]!.darts[0]!;
    expect(first.pos).toEqual({ x: 0, y: 103 });
    expect(first.source).toBe('manual');
  });

  it('calls an autoscored dart as it goes in, and the visit when it ends', () => {
    const voice = caller();
    const said = vi.spyOn(voice, 'sequence');
    const settings = useSettingsStore();
    settings.settings = { ...settings.settings, callerEnabled: true };
    useMatchesStore().start(config);

    useMatchesStore().throwDart(hit(20, 'treble'), { source: 'auto', call: true });
    expect(said).toHaveBeenLastCalledWith([[strings().caller.hit(hit(20, 'treble'))]]);

    useMatchesStore().throwDart(hit(20, 'treble'), { source: 'auto', call: true });
    useMatchesStore().throwDart(hit(20, 'treble'), { source: 'auto', call: true });
    const last = said.mock.lastCall![0];
    expect(last[0]).toEqual([strings().caller.hit(hit(20, 'treble'))]);
    expect(last[1]).toEqual([strings().caller.visit(180)]);
    said.mockRestore();
  });

  it('undoes the last dart', () => {
    useMatchesStore().start(config);
    useMatchesStore().throwDart(hit(20, 'treble'));
    useMatchesStore().undo();

    expect(useMatchesStore().match!.events).toHaveLength(0);
    expect(useMatchesStore().snapshot!.legs[0]!.remaining.ann).toBe(501);
  });

  it('corrects a dart without losing what was first recorded', () => {
    useMatchesStore().start(config);
    useMatchesStore().throwDart(hit(20, 'treble'), { source: 'auto', confidence: 0.4 });

    const dartId = useMatchesStore().snapshot!.legs[0]!.visits[0]!.darts[0]!.id;
    useMatchesStore().correctDart(dartId, parseHit('S20')!);

    const dart = useMatchesStore().snapshot!.legs[0]!.visits[0]!.darts[0]!;
    expect(dart.hit.value).toBe(20);
    expect(dart.original?.hit.value).toBe(60);
    expect(dart.original?.source).toBe('auto');
    expect(useMatchesStore().snapshot!.legs[0]!.remaining.ann).toBe(481);
  });

  it('ignores darts once the match is won', () => {
    useMatchesStore().start({ ...config, startScore: 40, players: [config.players[0]!] });
    useMatchesStore().throwDart(hit(20, 'double'));
    expect(useMatchesStore().snapshot!.winnerId).toBe('ann');

    useMatchesStore().throwDart(hit(20, 'treble'));
    expect(useMatchesStore().match!.events).toHaveLength(1);
  });
});
