import { describe, expect, it } from 'vitest';

import { basePath, pagesFor } from '@/router/pages.js';

const INDEX = '<html>\n  <head>\n    <title>treblewise</title>\n  </head>\n  <body></body>\n</html>';
const SITE = 'https://fre0grella.github.io/treblewise/';

describe('pagesFor', () => {
  const pages = pagesFor(INDEX, SITE);
  const page = (file: string) => pages.find((p) => p.file === file)?.html;

  it('writes a page for every address without a parameter, nested ones too', () => {
    for (const file of ['start/index.html', 'lobby/index.html', 'camera/index.html', 'pair/laptop/index.html', 'pair/phone/index.html']) {
      expect(page(file)).toBeDefined();
    }
    expect(pages.some((p) => p.file.includes(':'))).toBe(false);
  });

  it('keeps the landing page indexable, with its canonical address', () => {
    expect(page('index.html')).not.toContain('noindex');
    expect(page('index.html')).toContain(`<link rel="canonical" href="${SITE}" />`);
    expect(page('index.html')).toContain(`<meta property="og:url" content="${SITE}" />`);
  });

  it('keeps every other page, and the 404 that loads the app for addresses with an id, out of search', () => {
    expect(page('stats/index.html')).toContain('<meta name="robots" content="noindex" />');
    expect(page('404.html')).toContain('<meta name="robots" content="noindex" />');
    expect(page('404.html')).not.toContain('canonical');
  });

  it('names no canonical address when the build was not told the site', () => {
    expect(pagesFor(INDEX, null).find((p) => p.file === 'index.html')?.html).toBe(INDEX);
  });
});

describe('basePath', () => {
  it('serves from the site address path, or from the root', () => {
    expect(basePath(SITE)).toBe('/treblewise/');
    expect(basePath('https://treblewise.app')).toBe('/');
    expect(basePath(null)).toBe('/');
  });
});
