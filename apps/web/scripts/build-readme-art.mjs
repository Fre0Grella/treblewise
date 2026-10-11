/*
 * Builds the pictures the README shows, from the app itself: the banner (the
 * wordmark over the landing page's turning board), the landing cards'
 * drawings, and a screenshot of the landing page on a laptop and a phone.
 *
 *     npm run build && npm run preview      # in one terminal
 *     node apps/web/scripts/build-readme-art.mjs [http://localhost:4173/]
 *
 * Needs Playwright importable (`npm install --no-save playwright`) and its
 * Chromium. Everything is copied out of the rendered page, with the theme's
 * colours written in, so the README stays true to the app: change the app (or
 * scripts/build-logo.py for the logo), not these files.
 *
 * Writes, in docs/assets/:
 *   banner.svg                      the wordmark and the lede on the board
 *   card-score.svg, card-caller.svg, card-stats.svg, card-device.svg
 *   screenshot.png                  the landing page, laptop and phone
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright not found: npm install --no-save playwright');
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = join(ROOT, 'docs', 'assets');
const address = process.argv[2] ?? 'http://localhost:4173/';
const CARDS = ['score', 'caller', 'stats', 'device'];
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/**
 * Runs in the page: the svg's markup with every var(--x), and currentColor,
 * replaced by the colour the page gives it, and the app's classes and Vue's
 * attributes dropped. Classes that set a colour are written in first.
 */
function flatten(svg, { font, classFills = {} }) {
  const css = getComputedStyle(document.documentElement);
  const clone = svg.cloneNode(true);
  for (const [cls, fill] of Object.entries(classFills)) {
    clone.querySelectorAll(`.${cls}`).forEach((el) => el.setAttribute('fill', fill));
  }
  const ink = getComputedStyle(svg).color;
  for (const el of [clone, ...clone.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) {
      if (a.name === 'class' || a.name === 'aria-hidden' || a.name.startsWith('data-v')) {
        el.removeAttribute(a.name);
        continue;
      }
      let v = a.value.replace(/var\((--[\w-]+)\)/g, (_, name) => css.getPropertyValue(name).trim());
      v = v.replace(/currentColor/g, ink);
      if (v !== a.value) el.setAttribute(a.name, v);
    }
    // Inline styles: only the animation delays, which reduced motion makes moot.
    el.removeAttribute('style');
    if (el.tagName === 'text') el.setAttribute('font-family', font);
  }
  return { viewBox: clone.getAttribute('viewBox'), inner: clone.innerHTML.replace(/<!--[\s\S]*?-->/g, '') };
}

async function landing(browser, viewport, scale) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  // Still pictures: the board, the waves and the bars at rest.
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.goto(address);
  await page.waitForSelector('.landing-backdrop-board svg');
  await page.waitForTimeout(400);
  return page;
}

function banner(mark, board, lede, colours) {
  const [, , mw, mh] = mark.viewBox.split(' ').map(Number);
  const [bx, by, bw] = board.viewBox.split(' ').map(Number);
  const W = 1280;
  const H = 400;
  const markW = 640;
  const k = markW / mw;
  const boardR = 470;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><clipPath id="tile"><rect width="${W}" height="${H}" rx="28"/></clipPath></defs>
<g clip-path="url(#tile)">
<rect width="${W}" height="${H}" fill="${colours.bg}"/>
<g opacity="0.22" transform="translate(${W - 120} ${70}) scale(${(2 * boardR) / bw}) translate(${-(bx + bw / 2)} ${-(by + bw / 2)})">${board.inner}</g>
<g transform="translate(80 ${96}) scale(${k})">${mark.inner}</g>
<text x="82" y="${96 + mh * k + 64}" font-family="${FONT}" font-size="30" font-weight="700" fill="${colours.text}">${lede.head}</text>
<text x="82" y="${96 + mh * k + 104}" font-family="${FONT}" font-size="22" fill="${colours.dim}">${lede.tail}</text>
</g>
</svg>
`;
}

function card(art, colours) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300"><rect x="1" y="1" width="398" height="298" rx="22" fill="${colours.raised}" stroke="${colours.line}" stroke-width="2"/>${art.inner}</svg>\n`;
}

/** The laptop's page in a window, the phone's in front of it, on transparent. */
function showcase(desktop, phone) {
  return `<!doctype html><html><body style="margin:0;background:transparent">
<div id="stage" style="position:relative;width:1480px;height:960px">
  <div style="position:absolute;left:24px;top:24px;width:1280px;border-radius:14px;overflow:hidden;background:#2c2820;box-shadow:0 24px 60px rgb(0 0 0 / 45%),0 0 0 1px #3a352b">
    <div style="height:36px;display:flex;align-items:center;gap:8px;padding-left:16px">
      <i style="width:12px;height:12px;border-radius:50%;background:#c0182f"></i>
      <i style="width:12px;height:12px;border-radius:50%;background:#eacf75"></i>
      <i style="width:12px;height:12px;border-radius:50%;background:#00713c"></i>
    </div>
    <img style="display:block;width:1280px" src="data:image/png;base64,${desktop}">
  </div>
  <div style="position:absolute;right:24px;bottom:24px;width:330px;padding:12px;border-radius:52px;background:#0b0a08;box-shadow:0 30px 70px rgb(0 0 0 / 55%),0 0 0 2px #3a352b">
    <img style="display:block;width:330px;border-radius:40px" src="data:image/png;base64,${phone}">
  </div>
</div></body></html>`;
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

const page = await landing(browser, { width: 1280, height: 860 }, 1);
const colours = await page.evaluate(() => {
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  return { bg: v('--bg'), raised: v('--bg-raised'), line: v('--line'), text: v('--text'), dim: v('--text-dim'), red: v('--board-red'), green: v('--board-green') };
});
const mark = await page.$eval('.landing-mark svg', flatten, {
  font: FONT,
  classFills: { 'wordmark-ink': colours.text, 'wordmark-red': colours.red, 'wordmark-green': colours.green },
});
const board = await page.$eval('.landing-backdrop-board svg', flatten, { font: FONT });
const arts = [];
for (const svg of await page.$$('.landing-point-art svg')) arts.push(await svg.evaluate(flatten, { font: FONT }));
const lede = {
  head: 'Darts, scored properly.',
  tail: 'X01 · a spoken caller · statistics from every dart · a camera that reads the board',
};
await writeFile(join(OUT, 'banner.svg'), banner(mark, board, lede, colours));
for (const [i, name] of CARDS.entries()) await writeFile(join(OUT, `card-${name}.svg`), card(arts[i], colours));
const desktop = (await page.screenshot()).toString('base64');

const phonePage = await landing(browser, { width: 390, height: 780 }, 2);
const phone = (await phonePage.screenshot()).toString('base64');

const stage = await browser.newPage({ viewport: { width: 1480, height: 960 } });
await stage.setContent(showcase(desktop, phone));
await stage.locator('#stage').screenshot({ path: join(OUT, 'screenshot.png'), omitBackground: true });

await browser.close();
console.log('wrote banner.svg, card-*.svg and screenshot.png in docs/assets');
