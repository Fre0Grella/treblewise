/**
 * The HTML pages the build writes so GitHub Pages can answer every address.
 *
 * Pages has no rewrites: an address that is not a file is a 404. So each
 * address without a parameter gets its own copy of index.html, in a folder of
 * its name, and a reload, a shared link and a crawler all get a real page with
 * status 200. Addresses with an id (a match in history, a photograph in
 * review) show data that lives only on the device, so they fall through to
 * 404.html: a copy too, so the app still loads, with the status a crawler
 * should see.
 *
 * Only the landing page is meant to be found by a search engine. Every other
 * page says so in its HTML, not just once the app has run, and the landing
 * page names its canonical address when the build knows the site's.
 */

import { PATHS, STATIC_PATHS } from './paths.js';

export interface Page {
  /** Relative to the build's output folder. */
  file: string;
  html: string;
}

const NOINDEX = '<meta name="robots" content="noindex" />';

function inHead(html: string, tags: string): string {
  return html.replace('</head>', `    ${tags}\n  </head>`);
}

/**
 * The pages to write beside the built index.html, and that index.html as it
 * should be. `siteUrl` is the site's address with a trailing slash, or null
 * when the build was not told it.
 */
export function pagesFor(index: string, siteUrl: string | null): Page[] {
  const landing = siteUrl
    ? inHead(index, `<link rel="canonical" href="${siteUrl}" />
    <meta property="og:url" content="${siteUrl}" />`)
    : index;
  const app = inHead(index, NOINDEX);
  return [
    { file: 'index.html', html: landing },
    ...STATIC_PATHS.filter((path) => path !== PATHS.landing).map((path) => ({
      file: `${path.slice(1)}/index.html`,
      html: app,
    })),
    { file: '404.html', html: app },
  ];
}

/** The base path the app is served from, taken from the site's address: `/treblewise/` on Pages, `/` otherwise. */
export function basePath(siteUrl: string | null): string {
  if (!siteUrl) return '/';
  const path = new URL(siteUrl).pathname;
  return path.endsWith('/') ? path : `${path}/`;
}
