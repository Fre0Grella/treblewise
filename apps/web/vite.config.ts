import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
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

const base = basePath(siteUrl);

/** The theme's background (--black-900), for the installed app's title bar and splash. */
const BACKGROUND = '#15130f';

/**
 * The installable app (issue #13): a manifest, and a service worker that
 * keeps the app working with no network after one visit.
 *
 * Precached, so a whole game works offline from the first visit: the app,
 * its fonts and sounds, the icons, and the caller's clips (the caller is on
 * by default). Cached when first used instead: the autoscorer's model and
 * ONNX Runtime's .wasm, megabytes nobody who never turns the camera on
 * should download. The model is added by the deploy (deploy.yml), and its
 * file name carries its hash, as the .wasm's and the clips' do: such a file
 * never changes, so it is served from the cache; the small manifests that
 * name them are asked of the network first. Each runtime cache keeps one or
 * two files, or every deploy would leave its old model on the phone.
 *
 * A new version waits until the player says so (src/pwa/update.ts): a reload
 * in the middle of a match is not ours to do.
 */
const pwa = VitePWA({
  registerType: 'prompt',
  injectRegister: false,
  manifest: {
    // The app's identity: kept even if where it starts ever changes.
    id: base,
    name: 'treblewise',
    short_name: 'treblewise',
    description: 'Darts scoring, calling and statistics. Tap the board or let the camera read it.',
    start_url: base,
    scope: base,
    display: 'standalone',
    theme_color: BACKGROUND,
    background_color: BACKGROUND,
    // Relative to the manifest, which sits at the base.
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,mp3,wav,json,webmanifest}'],
    // The model is the deploy's, and a local one in public/ must not ride along.
    globIgnores: ['models/**', '**/*.wasm'],
    // The caller's clips are one file of a few megabytes.
    maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
    // Every address opens the app, as on Pages (src/router/pages.ts).
    navigateFallback: `${base}index.html`,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        urlPattern: ({ url }) => url.pathname.endsWith('/models/manifest.json'),
        handler: 'NetworkFirst',
        options: { cacheName: 'model-manifest', networkTimeoutSeconds: 4 },
      },
      {
        urlPattern: ({ url }) => url.pathname.endsWith('.onnx'),
        handler: 'CacheFirst',
        options: { cacheName: 'model', expiration: { maxEntries: 1 } },
      },
      {
        urlPattern: ({ url }) => url.pathname.endsWith('.wasm'),
        handler: 'CacheFirst',
        options: { cacheName: 'onnx-runtime', expiration: { maxEntries: 2 } },
      },
    ],
  },
});

export default defineConfig({
  plugins: [vue(), pages(), pwa],
  // Absolute: the router uses real paths, and a relative base breaks as soon as
  // an address has two segments.
  base,
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
