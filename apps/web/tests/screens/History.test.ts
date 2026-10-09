import { fireEvent, screen } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteMatch, listMatches, putMatch, type StoredMatch } from '@/storage/db.js';
import { useMatchesStore } from '@/store/stores.js';
import { renderAt } from '../support/renderAt.js';

const match = (id: string, finished: boolean): StoredMatch => ({
  id,
  createdAt: 1000,
  updatedAt: 2000,
  finished,
  events: [{ type: 'dart.thrown', id: `${id}-d`, ts: 1, hit: { sector: 20, ring: 'treble', value: 60 }, source: 'manual' }],
  config: {
    startScore: 501,
    inRule: 'straight',
    outRule: 'double',
    legsPerSet: 1,
    setsToWin: 1,
    players: [
      { id: 'ann', name: 'Ann' },
      { id: 'bob', name: 'Bob' },
    ],
  },
});

describe('past matches', () => {
  beforeEach(async () => {
    for (const stored of await listMatches(Number.MAX_SAFE_INTEGER)) await deleteMatch(stored.id);
    await putMatch(match('old', true));
    await putMatch(match('open', false));
  });

  it('lists the matches kept on this device, each linked by its id', async () => {
    const { router } = await renderAt('/history');
    const links = await screen.findAllByRole('link', { name: /501 · ann v bob/i });
    expect(links).toHaveLength(2);
    await fireEvent.click(links[0]!);
    await vi.waitFor(() => expect(router.currentRoute.value.path).toMatch(/^\/history\/(old|open)$/));
  });

  it('opens one match at its own address, and resumes it from there', async () => {
    const { router } = await renderAt('/history/open');
    expect(await screen.findAllByRole('link', { name: /ann v bob/i })).toHaveLength(1);
    await fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/game'));
    expect(useMatchesStore().match?.id).toBe('open');
  });

  it('says so when the address names a match this device does not have', async () => {
    const { router } = await renderAt('/history/elsewhere');
    expect(await screen.findByText(/not on this device/i)).toBeDefined();
    await fireEvent.click(screen.getByRole('button', { name: /all matches/i }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/history'));
  });
});
