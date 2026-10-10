"""
Builds the treblewise logo (issue #23): the wordmark the landing page shows,
the favicon, and the app icons.

    python apps/web/scripts/build-logo.py

Needs `pip install fonttools pillow` and Chrome or Edge, which draws the PNGs
(--chrome to point at one). The lettering is Barlow (SIL OFL 1.1, docs/08),
outlined to plain paths, so the app loads no font for it. ExtraBold is
downloaded once into a cache (--cache); the t of both marks is Barlow's t
without its crossbar, copied below from ExtraBold and Black.

The logo is the treble ring. The wordmark is "treblewise" in Barlow
ExtraBold, with the t's crossbar raised above the word and running on across
it as a row of beds, red and green with the wire between them; the dot of the
i is the bull. The icon is three of those beds seen close up, green, red,
green (treble 20 between the 5 and the 1), with the same t, at Black weight
for small sizes, in the red one. The two are used apart, never side by side:
the wordmark already starts with the t.

Writes:
  apps/web/src/components/wordmarkData.ts   the wordmark's paths, for Wordmark.vue
  apps/web/public/favicon.svg, favicon.ico  the beds alone, no tile (16, 32, 48 px)
  apps/web/public/icons/icon.svg            the beds on the board-black tile
  apps/web/public/icons/icon-192.png, icon-512.png
  apps/web/public/icons/icon-maskable-512.png   full bleed, the mark inside the safe circle
  apps/web/public/icons/apple-touch-icon.png    180 px, full bleed: iOS rounds the corners
"""

import argparse
import base64
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / "apps" / "web"
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/barlow/{}"
FONTS = ("Barlow-ExtraBold.ttf",)

# The board's colours, as in global.css.
BLACK = "#15130f"
CREAM = "#f8f0d4"
RED = "#c0182f"
GREEN = "#00713c"


def num(v):
    return ("%.2f" % v).rstrip("0").rstrip(".")


def rect(x, y, w, h):
    return f"M{num(x)} {num(y)}H{num(x + w)}V{num(y + h)}H{num(x)}Z"


def transformed(d, t):
    """Path data d with the affine transform t baked in."""
    pen = SVGPathPen(None, ntos=num)
    parse_path(d, TransformPen(pen, t))
    return pen.getCommands()


class Face:
    def __init__(self, path):
        self.font = TTFont(path)
        self.glyphs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.xh = self.font["OS/2"].sxHeight

    def name(self, ch):
        return self.cmap[ord(ch)]

    def adv(self, ch):
        return self.font["hmtx"][self.name(ch)][0]

    def bounds(self, ch):
        from fontTools.pens.boundsPen import BoundsPen

        pen = BoundsPen(self.glyphs)
        self.glyphs[self.name(ch)].draw(pen)
        return pen.bounds

    def path(self, glyph, x, base, s):
        pen = SVGPathPen(self.glyphs, ntos=num)
        self.glyphs[glyph].draw(TransformPen(pen, (s, 0, 0, -s, x, base)))
        return pen.getCommands()


# The t of both marks is Barlow's t without its crossbar: the stem and the
# hooked foot, the stem running up to {top}. Font units, y up as negative.
T_EXTRABOLD = (
    "M94 -{top}V-129Q95 -52 137 -24.5Q179 3 266 3Q288 3 336 1Q348 -1 348 -12"
    "V-128Q348 -133 344.5 -136.5Q341 -140 336 -140H299Q253 -140 253 -197V-{top}Z"
)
T_BLACK = (
    "M90 -{top}V-130Q91 -52 134 -24Q177 4 268 4Q304 4 343 1Q358 -1 358 -15"
    "V-143Q358 -150 354 -154Q350 -158 343 -158H306Q270 -158 270 -208V-{top}Z"
)


# ------------------------------------------------------------------ wordmark

def wordmark(face):
    """The wordmark at an x-height of 100. Returns its viewBox size and paths:
    ink (the letters, the t and its crossbar), red and green (the beds), and
    the bull."""
    s = 100 / face.xh
    bar_lo, bar_hi, t_top = 730, 880, 1010  # font units above the baseline
    stem_l, stem_r, arm = 94, 253, 150
    wire = 5.5
    base = t_top * s
    t_x = (arm - stem_l) * s  # the crossbar starts at x = 0
    ink = [transformed(T_EXTRABOLD.format(top=t_top), (s, 0, 0, s, t_x, base))]
    x = t_x + 372 * s
    lowest = 0
    bull = None
    for ch in "reblewise":
        if ch == "i":
            ink.append(face.path("dotlessi", x, base, s))
            x0, _, x1, _ = face.bounds("i")
            bull = (x + (x0 + x1) / 2 * s, base - 628 * s, 92 * s)
        else:
            ink.append(face.path(face.name(ch), x, base, s))
        lowest = min(lowest, face.bounds(ch)[1])
        x += face.adv(ch) * s
    right = x - (face.adv("e") - face.bounds("e")[2]) * s
    # The t's own crossbar, in the letters' colour, as long either side of
    # the stem; then the beds to the end of the word, red first.
    sx0, sx1 = t_x + stem_l * s, t_x + stem_r * s
    cross_r = sx1 + sx0
    bar_y, bar_h = base - bar_hi * s, (bar_hi - bar_lo) * s
    ink.append(rect(0, bar_y, cross_r, bar_h))
    a = cross_r + wire
    n = max(1, round((right - a) / 135))
    w = (right - a - wire * (n - 1)) / n
    beds = {"red": [], "green": []}
    for i in range(n):
        beds["red" if i % 2 == 0 else "green"].append(rect(a + i * (w + wire), bar_y, w, bar_h))
    height = base - lowest * s
    return dict(
        width=right,
        height=height,
        ink="".join(ink),
        red="".join(beds["red"]),
        green="".join(beds["green"]),
        bull=bull,
    )


def wordmark_ts(m):
    cx, cy, r = m["bull"]
    return f"""// Generated by apps/web/scripts/build-logo.py: change that, not this.
// The treblewise wordmark (issue #23), outlined from Barlow ExtraBold (SIL OFL 1.1).

/** The viewBox, at an x-height of 100. */
export const WORDMARK_VIEWBOX = '0 0 {num(m["width"])} {num(m["height"])}';

/** The letters, the t and its crossbar: drawn in the text colour. */
export const WORDMARK_INK =
  '{m["ink"]}';

/** The beds of the bar. */
export const WORDMARK_RED =
  '{m["red"]}';
export const WORDMARK_GREEN =
  '{m["green"]}';

/** The dot of the i: the bull, green ring and red centre. */
export const WORDMARK_BULL = {{ cx: {num(cx)}, cy: {num(cy)}, r: {num(r)} }};
"""


# ---------------------------------------------------------------------- icon

def icon_mark(x0, x1, y0, y1, side, wire):
    """The three beds in the box (x0..x1, y0..y1), the t in the red one."""
    red = (x0 + side + wire, x1 - side - wire)
    greens = rect(x0, y0, side, y1 - y0) + rect(x1 - side, y0, side, y1 - y0)
    # The t: Black's stem and foot, with the crossbar raised as in the wordmark.
    height = (y1 - y0) * 0.78
    base = y1 - (y1 - y0) * 0.1
    s = height / 1014
    tx = 256 - 180 * s
    t = transformed(T_BLACK.format(top=1010), (s, 0, 0, s, tx, base))
    t += rect(tx - 75 * s, base - 890 * s, 510 * s, 170 * s)
    return (
        f'<path fill="{GREEN}" d="{greens}"/>'
        f'<path fill="{RED}" d="{rect(red[0], y0, red[1] - red[0], y1 - y0)}"/>'
        f'<path fill="{CREAM}" d="{t}"/>'
    )


def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{body}</svg>\n'


def scaled(body, k):
    return f'<g transform="translate(256 256) scale({k}) translate(-256 -256)">{body}</g>'


def icons():
    favicon = svg(icon_mark(0, 512, 16, 496, 74, 22))
    tile_mark = icon_mark(40, 472, 92, 420, 70, 18)
    return dict(
        favicon=favicon,
        tile=svg(f'<rect width="512" height="512" rx="112" fill="{BLACK}"/>{tile_mark}'),
        # Full bleed: the platform cuts the shape. The maskable mark stays in
        # the central circle of radius 0.4, which every mask keeps.
        maskable=svg(f'<rect width="512" height="512" fill="{BLACK}"/>{scaled(tile_mark, 0.74)}'),
        apple=svg(f'<rect width="512" height="512" fill="{BLACK}"/>{scaled(tile_mark, 0.9)}'),
    )


# ----------------------------------------------------------------- rasterise

def find_chrome(given):
    candidates = [given] if given else [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        shutil.which("google-chrome") or "",
        shutil.which("chromium") or "",
    ]
    for c in candidates:
        if c and Path(c).exists():
            return c
    raise SystemExit("Chrome or Edge not found: pass --chrome")


def png(chrome, svg_text, size, out, work):
    """svg_text drawn at size x size, on transparent. The page is larger than
    the image, since headless Chrome clamps small windows, and is cropped."""
    data = base64.b64encode(svg_text.encode()).decode()
    page = work / "page.html"
    page.write_text(
        '<!doctype html><html><body style="margin:0;background:transparent">'
        f'<img style="display:block" width="{size}" height="{size}" src="data:image/svg+xml;base64,{data}">'
        "</body></html>",
        newline="",
    )
    shot = work / "shot.png"
    subprocess.run(
        [chrome, "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
         "--default-background-color=00000000", f"--screenshot={shot}", "--window-size=600,600",
         page.as_uri()],
        check=True, capture_output=True,
    )
    img = Image.open(shot).convert("RGBA").crop((0, 0, size, size))
    img.save(out)
    return img


def fetch_fonts(cache):
    cache.mkdir(parents=True, exist_ok=True)
    for name in FONTS:
        target = cache / name
        if not target.exists():
            print(f"downloading {name}")
            urllib.request.urlretrieve(FONT_URL.format(name), target)
    return [cache / name for name in FONTS]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--cache", type=Path, default=Path.home() / ".cache" / "treblewise-logo")
    ap.add_argument("--chrome", help="path to Chrome or Edge")
    args = ap.parse_args()

    (extrabold,) = (Face(p) for p in fetch_fonts(args.cache))
    chrome = find_chrome(args.chrome)

    ts = WEB / "src" / "components" / "wordmarkData.ts"
    ts.write_text(wordmark_ts(wordmark(extrabold)), newline="")

    public = WEB / "public"
    (public / "icons").mkdir(parents=True, exist_ok=True)
    marks = icons()
    (public / "favicon.svg").write_text(marks["favicon"], newline="")
    (public / "icons" / "icon.svg").write_text(marks["tile"], newline="")

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        small = [png(chrome, marks["favicon"], n, work / f"fav{n}.png", work) for n in (16, 32, 48)]
        small[-1].save(public / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)],
                       append_images=small[:-1])
        png(chrome, marks["tile"], 192, public / "icons" / "icon-192.png", work)
        png(chrome, marks["tile"], 512, public / "icons" / "icon-512.png", work)
        png(chrome, marks["maskable"], 512, public / "icons" / "icon-maskable-512.png", work)
        png(chrome, marks["apple"], 180, public / "icons" / "apple-touch-icon.png", work)
    print(f"wrote {ts.relative_to(ROOT)} and the icons in {public.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
