import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

import { basePath, pagesFor } from './src/router/pages.js';

/**
 * The site's address, with a trailing slash: set by the deploy. The base path
 * the app is served from comes from it, and so does the landing page's
 * canonical address. Unset in development and tests: served from the root.
 */
const siteUrl = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/?$/, '/') : null;

/** A page for every address GitHub Pages has to answer (src/router/pages.ts). */
function pages(): Plugin {
  let outDir = 'dist';
  return {
    name: 'treblewise-pages',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async closeBundle() {
      const index = await readFile(join(outDir, 'index.html'), 'utf8');
      for (const page of pagesFor(index, siteUrl)) {
        const file = join(outDir, page.file);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, page.html);
      }
    },
  };
}

export default defineConfig({
  plugins: [vue(), pages()],
  // Absolute: the router uses real paths, and a relative base breaks as soon as
  // an address has two segments.
  base: basePath(siteUrl),
  // The tests live in tests/, beside src/, and reach the app as `@/…`.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/support/setup.ts'],
    globals: true,
  },
});
