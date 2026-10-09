/**
 * Every screen's address, and the old ones they replace.
 *
 * Plain data, no router: the router builds its routes from it, and the build
 * reads it too, to write a page for each address GitHub Pages has to answer
 * (see vite.config.ts). Pages has no rewrites, so an address that is not a
 * file there is a 404.
 */

export const PATHS = {
  landing: '/',
  start: '/start',
  lobby: '/lobby',
  setup: '/setup',
  game: '/game',
  history: '/history',
  match: '/history/:id',
  stats: '/stats',
  review: '/review',
  photo: '/review/:id',
  camera: '/camera',
  pair: '/pair',
  pairLaptop: '/pair/laptop',
  pairPhone: '/pair/phone',
} as const;

export type RouteName = keyof typeof PATHS;

/** Addresses with no parameter: each gets a real page in the build. */
export const STATIC_PATHS: readonly string[] = Object.values(PATHS).filter((path) => !path.includes(':'));

/**
 * The addresses of the hash-routed app, and where each lives now. Not a rename
 * by word: the old #/pair was the laptop's side of pairing, and the old
 * #/phone the phone's.
 */
const OLD_HASHES: Readonly<Record<string, string>> = {
  '#/': PATHS.landing,
  '#/play': PATHS.start,
  '#/lobby': PATHS.lobby,
  '#/review': PATHS.review,
  '#/new': PATHS.setup,
  '#/game': PATHS.game,
  '#/history': PATHS.history,
  '#/camera': PATHS.camera,
  '#/pair-role': PATHS.pair,
  '#/pair': PATHS.pairLaptop,
  '#/phone': PATHS.pairPhone,
  '#/stats': PATHS.stats,
};

/** Where an old `#/…` address lives now, or null for any other hash. */
export function pathForOldHash(hash: string): string | null {
  return OLD_HASHES[hash] ?? null;
}
