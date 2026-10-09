/**
 * Prints the caller's phrases as JSON, for the clip pack generator
 * (build-caller-pack.py). Run with `npx vite-node apps/web/scripts/caller-phrases.ts`.
 */

import { clipPhrases } from '../src/caller/phrases.js';

process.stdout.write(JSON.stringify(clipPhrases()));
