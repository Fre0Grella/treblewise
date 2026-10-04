import { beforeEach, describe, expect, it } from 'vitest';

import {
  deleteMatch,
  deleteProfile,
  listMatches,
  listProfiles,
  loadSettings,
  putMatch,
  putProfile,
  saveSetting,
  type StoredMatch,
} from './db.js';

// The tests run without IndexedDB, so these exercise the in-memory stand-in,
// which is migrated on every access rather than once at open.

function played(id: string, createdAt: number, updatedAt: number, players: StoredMatch['config']['players']): StoredMatch {
  return {
    id,
    createdAt,
    updatedAt,
    finished: true,
    events: [],
    config: { startScore: 501, inRule: 'straight', outRule: 'double', legsPerSet: 1, setsToWin: 1, players },
  };
}

describe('seeding profiles from matches played before profiles existed', () => {
  beforeEach(async () => {
    for (const match of await listMatches(Number.MAX_SAFE_INTEGER)) await deleteMatch(match.id);
    for (const profile of await listProfiles()) await deleteProfile(profile.id);
  });

  it('finds the players of old matches when the database is next used', async () => {
    await putMatch(played('older', 1000, 2000, [{ id: 'marco', name: 'Marco' }]));
    await putMatch(
      played('newer', 3000, 4000, [
        { id: 'marco', name: 'Marco G.' },
        { id: 'ann', name: 'Ann' },
        { id: 'guest-old', name: 'Dave', temporary: true },
      ]),
    );
    await putProfile({ id: 'ann', name: 'Annie', createdAt: 500, lastPlayedAt: 600 });
    await saveSetting('profilesSeeded', false);

    const profiles = await listProfiles();

    // Marco is found, named and dated by the most recent match he is in, and
    // he last played in the latest one. The guest stays forgotten, and Ann,
    // already a profile, is left exactly as she was.
    expect(profiles).toEqual([
      { id: 'marco', name: 'Marco G.', createdAt: 3000, lastPlayedAt: 4000 },
      { id: 'ann', name: 'Annie', createdAt: 500, lastPlayedAt: 600 },
    ]);
    expect((await loadSettings()).profilesSeeded).toBe(true);
  });

  it('runs once only, so a profile deleted on purpose stays deleted', async () => {
    await putMatch(played('old', 1000, 2000, [{ id: 'marco', name: 'Marco' }]));
    await saveSetting('profilesSeeded', false);
    expect((await listProfiles()).map((profile) => profile.id)).toEqual(['marco']);

    await deleteProfile('marco');
    expect(await listProfiles()).toEqual([]);
  });

  it('marks itself done even when there was no one to find', async () => {
    await saveSetting('profilesSeeded', false);
    expect((await loadSettings()).profilesSeeded).toBe(true);

    // A match played from here on does not bring its players back as profiles.
    await putMatch(played('new', 1000, 2000, [{ id: 'marco', name: 'Marco' }]));
    expect(await listProfiles()).toEqual([]);
  });

  it('reads the most recent fifty matches only, as the seeding always has', async () => {
    await putMatch(played('oldest', 0, 1, [{ id: 'early', name: 'Early' }]));
    for (let i = 0; i < 50; i += 1) {
      await putMatch(played(`m${i}`, 10 + i, 100 + i, [{ id: 'marco', name: 'Marco' }]));
    }
    await saveSetting('profilesSeeded', false);

    expect((await listProfiles()).map((profile) => profile.id)).toEqual(['marco']);
  });
});
