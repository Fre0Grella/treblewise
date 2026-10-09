/**
 * Local storage: matches as append-only event logs, captured frames, and a few
 * settings.
 *
 * Everything stays on the device. A `SyncAdapter` boundary is deliberately not
 * introduced yet — there is nothing to sync with — but this module is the only
 * place that touches persistence, so adding one later is a single file.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import {
  DEFAULT_SETTINGS,
  type CapturedFrame,
  type Profile,
  type Settings,
  type StoredMatch,
} from './types.js';

export { DEFAULT_SETTINGS };
export type { CapturedFrame, Profile, Settings, StoredMatch } from './types.js';

interface TreblewiseDB extends DBSchema {
  matches: {
    key: string;
    value: StoredMatch;
    indexes: { 'by-updated': number };
  };
  frames: {
    key: string;
    value: CapturedFrame;
    indexes: { 'by-ts': number };
  };
  settings: {
    key: string;
    value: unknown;
  };
  profiles: {
    key: string;
    value: Profile;
  };
}

// The project's old name, kept on purpose: renaming the database would leave
// every saved match, profile and capture behind in the old one.
const DB_NAME = 'oche';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<TreblewiseDB>> | null = null;

/** In-memory stand-in, so tests and private-mode browsers still work. */
const memory = {
  matches: new Map<string, StoredMatch>(),
  settings: new Map<string, unknown>(),
  profiles: new Map<string, Profile>(),
};

/**
 * What IndexedDB keeps of a value: a structured clone. The fallback keeps the
 * same, so a value IndexedDB would refuse (a Vue proxy, say, which throws
 * DataCloneError) is refused here too, in a private window and in the tests,
 * instead of only on a real device.
 */
const stored = <T>(value: T): T => (typeof structuredClone === 'function' ? structuredClone(value) : value);

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

async function db(): Promise<IDBPDatabase<TreblewiseDB> | null> {
  if (!hasIndexedDB()) {
    // The stand-in is never opened, so it is migrated on every access instead;
    // once the flag is set that is one map lookup.
    migrateMemory();
    return null;
  }
  if (!dbPromise) {
    dbPromise = openDB<TreblewiseDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const matches = database.createObjectStore('matches', { keyPath: 'id' });
          matches.createIndex('by-updated', 'updatedAt');
          database.createObjectStore('settings');
        }
        if (oldVersion < 2) {
          const frames = database.createObjectStore('frames', { keyPath: 'id' });
          frames.createIndex('by-ts', 'ts');
        }
        if (oldVersion < 3) {
          database.createObjectStore('profiles', { keyPath: 'id' });
        }
      },
    }).then(async (database) => {
      // Nobody is handed the database until its data is migrated, so the
      // first reads already see the result.
      try {
        await migrateDatabase(database);
      } catch {
        // The flag stays unset and the migration runs again at the next open;
        // a profile list missing old players beats an app that cannot start.
      }
      return database;
    });
  }
  try {
    return await dbPromise;
  } catch {
    // Blocked or unavailable (private window, cleared site data): fall back.
    return null;
  }
}

/**
 * Data migrations change what is stored rather than how, so they cannot go in
 * `upgrade`, which only runs when the schema version moves. They run when the
 * database opens instead, each guarded by a flag kept with the settings, and
 * nothing outside this module knows they exist.
 *
 * There is one. Before profiles existed, a player's id was derived from their
 * name at the start of every match — the same derivation a new profile still
 * uses. So the matches already on a device name their players, and a returning
 * player should find their history waiting rather than a list that has
 * forgotten them. It runs once ever: without the flag, deleting every profile
 * on purpose would bring them all back on the next load.
 */
const PROFILES_SEEDED = 'profilesSeeded' satisfies keyof Settings;

/** The seeding reads the most recent matches only, as it always has: it ran over the first page of the history. */
const SEED_FROM_MATCHES = 50;

/**
 * The profiles the matches name that are not profiles yet: guests are left
 * out, `createdAt` comes from the most recent match a player is in and
 * `lastPlayedAt` from the latest one. Matches come most recent first.
 */
function profilesFromMatches(matches: readonly StoredMatch[], known: readonly Profile[]): Profile[] {
  const found = new Map<string, Profile>();
  for (const match of matches) {
    for (const player of match.config.players) {
      if (player.temporary || known.some((profile) => profile.id === player.id)) continue;
      const seen = found.get(player.id);
      found.set(
        player.id,
        seen
          ? { ...seen, lastPlayedAt: Math.max(seen.lastPlayedAt ?? 0, match.updatedAt) }
          : { id: player.id, name: player.name, createdAt: match.createdAt, lastPlayedAt: match.updatedAt },
      );
    }
  }
  return [...found.values()];
}

async function migrateDatabase(database: IDBPDatabase<TreblewiseDB>): Promise<void> {
  if ((await database.get('settings', PROFILES_SEEDED)) === true) return;
  const matches = (await database.getAllFromIndex('matches', 'by-updated')).reverse().slice(0, SEED_FROM_MATCHES);
  const fresh = profilesFromMatches(matches, await database.getAll('profiles'));

  // One transaction, so the flag is never set without the profiles it stands for.
  const tx = database.transaction(['profiles', 'settings'], 'readwrite');
  await Promise.all([
    ...fresh.map((profile) => tx.objectStore('profiles').put(profile)),
    tx.objectStore('settings').put(true, PROFILES_SEEDED),
    tx.done,
  ]);
}

function migrateMemory(): void {
  if (memory.settings.get(PROFILES_SEEDED) === true) return;
  const matches = recentFirst([...memory.matches.values()]).slice(0, SEED_FROM_MATCHES);
  for (const profile of profilesFromMatches(matches, [...memory.profiles.values()])) {
    memory.profiles.set(profile.id, profile);
  }
  memory.settings.set(PROFILES_SEEDED, true);
}

function recentFirst(matches: StoredMatch[]): StoredMatch[] {
  return matches.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * The database, for the frame store. Frames are megabytes of JPEG, so there is
 * no in-memory fallback for them: without IndexedDB the capture lab says so
 * rather than filling a tab's heap and losing the lot on reload.
 */
export async function framesDb(): Promise<IDBPDatabase<TreblewiseDB> | null> {
  return db();
}

export async function putMatch(match: StoredMatch): Promise<void> {
  const database = await db();
  if (!database) {
    memory.matches.set(match.id, stored(match));
    return;
  }
  await database.put('matches', match);
}

export async function getMatch(id: string): Promise<StoredMatch | undefined> {
  const database = await db();
  if (!database) return memory.matches.get(id);
  return database.get('matches', id);
}

export async function deleteMatch(id: string): Promise<void> {
  const database = await db();
  if (!database) {
    memory.matches.delete(id);
    return;
  }
  await database.delete('matches', id);
}

/** Most recently updated first. */
export async function listMatches(limit = 50): Promise<StoredMatch[]> {
  const database = await db();
  if (!database) {
    return recentFirst([...memory.matches.values()]).slice(0, limit);
  }
  const all = await database.getAllFromIndex('matches', 'by-updated');
  return all.reverse().slice(0, limit);
}

export async function loadSettings(): Promise<Settings> {
  const database = await db();
  const read = async (key: keyof Settings): Promise<unknown> =>
    database ? database.get('settings', key) : memory.settings.get(key);

  const entries = await Promise.all(
    (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).map(async (key) => [key, await read(key)] as const),
  );

  const settings = { ...DEFAULT_SETTINGS };
  for (const [key, value] of entries) {
    if (value !== undefined) (settings as Record<string, unknown>)[key] = value;
  }
  return settings;
}

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  const database = await db();
  if (!database) {
    memory.settings.set(key, stored(value));
    return;
  }
  await database.put('settings', value, key);
}

export async function listProfiles(): Promise<Profile[]> {
  const database = await db();
  const all = database ? await database.getAll('profiles') : [...memory.profiles.values()];
  return all.sort((a, b) => (b.lastPlayedAt ?? b.createdAt) - (a.lastPlayedAt ?? a.createdAt));
}

export async function putProfile(profile: Profile): Promise<void> {
  const database = await db();
  if (!database) {
    memory.profiles.set(profile.id, stored(profile));
    return;
  }
  await database.put('profiles', profile);
}

export async function deleteProfile(id: string): Promise<void> {
  const database = await db();
  if (!database) {
    memory.profiles.delete(id);
    return;
  }
  await database.delete('profiles', id);
}

/** How much room the browser is giving us, for the capture lab's warning. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
}
