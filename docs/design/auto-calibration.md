# Automatic board calibration

Status: **implemented** (2026-10-30). Issue #24.

## Goals and non-goals

Goals:

- Pressing **Calibrate** puts the four markers on the board by itself. The
  person checks the wireframe, nudges a marker with the lens if needed, and
  saves. Today they drag all four.
- The result is at least as good as a careful hand calibration: the drawn wires
  sit on the real ones within about a millimetre.
- It works from nothing. No earlier calibration, no trained model, no data.
- When it cannot find the board, it says why and leaves the markers to the
  person, exactly as today.
- **It follows the board during play.** Pulling darts out nudges the board,
  and the phone slides on its hook over an evening. Between visits the board
  is found again on a photo already taken, and the calibration follows it
  when it has moved past a margin. The person's own adjustments are kept.

Non-goals:

- Boards whose beds are not red and green. They fall back to placing by hand.
- Following the board while darts are in it. The calibration only changes
  between visits, so a visit is never read under two calibrations.
- A trained board-pose model (docs/03 "model A", roadmap B2). See
  *Alternatives*.

## Layout

One folder, five files:

```
packages/core/src/vision/boardFinder/
  raster/                 generic image processing; knows nothing about darts
    masks.ts              image and mask types, reading between pixels, colour
                          masks, closing gaps, blobs with area and centre       ~160
    ellipse.ts            least-squares ellipse fit, ellipse ↔ conic, RANSAC    ~100
  locate.ts               the rough board: bull, double ring, camera angle,
                          which way the 20 is (steps 1–4)                       ~150
  refine.ts               edges and wire crossings, iterated fit (step 5)       ~120
  index.ts                findBoard: runs both, judges the fit, types           ~40
```

- `raster/` is the part OpenCV would have been. It never imports from outside
  `raster/`, and a test fails if it does. That keeps it liftable if other
  code (the web app's `imageStats.ts`) ever wants it.
- The rest imports `raster/`, `board/geometry`, `vision/homography` and
  `vision/calibration`. Only `index.ts` is exported from `@treblewise/core`.
- The split follows the two halves of the method. `locate.ts` finds the board
  roughly from nothing. `refine.ts` makes a rough homography exact, and is
  also all that **Find again** runs. They hand each other a `Matrix3`, so
  `refine.ts` can be tested from a known homography knocked off by a few
  millimetres.
- Tests mirror this under `packages/core/tests/vision/boardFinder/` (and its
  `raster/`). The synthetic board renderer goes in
  `packages/core/tests/fixtures/syntheticBoard.ts`.
- In the web app:
  - `vision/findBoard.ts` decodes the photo and talks to `findBoard.worker.ts`;
  - `composables/useBoardFinder.ts` paces the loading steps;
  - `components/FinderSteps.vue` is the loading screen;
  - `components/BoardFit.vue` is the verdict;
  - `vision/boardDrift.ts` decides, on an empty board's photo, whether the
    calibration follows (see *Following the board during play*);
  - `composables/useBoardDrift.ts` wires that to a screen.

  The board watcher hands on each photo of an empty board (`onEmptyBoard`),
  and the game visit and the marking session pass that through.
- `packages/core/scripts/eval-find-board.ts` is the check on real photos (see
  *Testing*).

## Interfaces and data contracts

`packages/core/src/vision/boardFinder/index.ts`, pure and framework-free like
the rest of `core/vision`:

```ts
export interface RgbaImage {
  data: Uint8ClampedArray; // RGBA, row-major, as ImageData has it
  width: number;
  height: number;
}

export interface FoundBoard {
  /** Board millimetres → image pixels, fitted on every ring and wire feature found. */
  toImage: Matrix3;
  /** CALIBRATION_LANDMARKS projected through toImage, in landmark order. */
  imagePoints: Point[];
  fit: {
    ringFeatures: number; // ring edges measured
    wireFeatures: number; // sector wires measured
    medianMm: number; // distance of each from its circle or line, board mm
    p90Mm: number;
    worstSector: number | null; // where to check, for the amber verdict
  };
}

export type BoardNotFound = 'noBull' | 'noRing' | 'weakFit';

export type FinderStep = 'colours' | 'bull' | 'ring' | 'tilt' | 'turn' | 'wires';

export function findBoard(
  image: RgbaImage,
  options?: {
    /** Start from here (the current markers) instead of searching the picture. */
    near?: Matrix3;
    /** Called as each step starts, for the loading screen. */
    onStep?: (step: FinderStep) => void;
  },
): FoundBoard | { notFound: BoardNotFound };
```

`apps/web/src/vision/findBoard.ts` decodes the frozen calibration photo
(`GrabbedFrame`) to an `RgbaImage`. It runs `findBoard` in a module Web
Worker, so the screen keeps moving while it works.

**Stored data gains one optional field.** A calibration is still four
`imagePoints` plus the homography solved from them. Four points projected
through the fitted homography give that same homography back, so the ML loader
and the exports are untouched. `Calibration.found?: Matrix3` keeps the
finder's own fit from when the calibration was saved, before any dragging. It
is what following the board compares with (see below). Calibrations without it
(older ones, or ones where the board was not found) are still followed, from
`toImage`.

## Design

The red and green beds are the strongest thing in the picture: saturated
colour in a ring of known size, around a bull of known size. Everything is
measured on two masks, red and green (HSV: saturation over about 90, value
over about 50, hue in the red or green band).

1. **Find the bull.** Close the red|green mask with a 5 px disc. Each compact,
   filled blob is a bull candidate. From each candidate, cast 90 rays
   outwards. On each ray, look for two colour runs whose outer ends are in the
   ratio of the double edge to the treble edge (169/106, give or take 20 %, the
   slack being perspective). The candidate with the most such rays, after the
   ellipse fit below, is the bull. Darts, the lamp and pale spots break the
   rings in places, so a closed ring is never required.
2. **Fit the double ring.** From the bull, cast 360 rays. RANSAC an ellipse
   through the double-ring hits (6-point fits, inliers within 2.5 % of the
   radius), then refit on the inliers.
3. **A projective start, exact up to a turn.** The image of a circle and the
   image of its centre give the board's vanishing line: it is the polar of
   the centre with respect to the ellipse. Sending that line to infinity leaves
   an ellipse centred on the bull, which an affine map turns into a 170 mm
   circle. That fixes everything except the rotation about the bull. An
   ellipse alone is not enough: under perspective the bull is not at the
   ellipse's centre, and the sectors fan out wrong.
4. **Choose the turn.** Sample red-minus-green around the double and treble
   beds, and correlate it with the board's pattern (the 20's beds are red, and
   the colours alternate) at every 0.5°. The pattern repeats every 36°.
   Among the peaks, take the one with the 20 nearest the top of the picture,
   or nearest the 20 of `near` when given.
5. **Refine on the wires.** Under the current homography, measure, up to
   10 mm from where it puts them:
   - the inner and outer edge of the treble and double beds on 100 lines
     (five per sector), at half the colour step, to a quarter of a millimetre;
   - where red turns to green across each of the 20 sector wires, on four
     arcs inside the two beds.

   A bed edge found in the photo must lie on its circle on the board, and a
   wire crossing on its sector line. Levenberg–Marquardt finds the eight
   numbers that put a few hundred of them closest to their circle or line.
   Measurements more than 3 times the median off it (darts) are dropped. The
   whole thing is repeated four times from the better estimate.

   This was first written as a point fit, pairing each measured edge with the
   board point on the ray that was searched, as the spike did. From a start a
   few millimetres off, a ray finds the edge where it crosses it, not where it
   was aimed, and that pairing carried the error into the next fit: a snap
   from 5 mm out stalled at 2 mm. Fitting to the curves converges.
6. **Judge it.** Fewer than 80 ring edges or 30 wire crossings means a weak
   fit, which is reported as not found rather than shown as a guess. The
   amber verdict names a sector when the measurements agreeing with the fit
   there sit 2 mm or more off their wires, and 3 times the board's median. On
   the user's photos a good fit's worst sector came to at most 2.6 times the
   median. Measured over all of them instead, the worst sector was simply
   wherever the darts were.

With `near`, steps 1 to 4 are skipped and step 5 starts from the given
homography. That is the **Find again** button: after the person drags the
markers roughly into place, it snaps them onto the wires. It is also how a
wrong 36° turn, or a board too far turned, gets fixed in one drag.

The bed edges come from `BOARD`: the beds are the wire centres ± half a wire,
so 98–106 mm and 161–169 mm.

No OpenCV. Its wasm build is several megabytes, its images must be freed by
hand, and it would pull the wasm into `core`'s Node tests. The parts it
would replace (an HSV threshold, a morphological close, connected components,
an ellipse fit, bilinear sampling) are about 190 lines of TypeScript, in
`raster/`. The other ~320 lines are about the board, and OpenCV has nothing
for them. The four-point homography solve already existed; its linear solver
is now exported for the curve fit.

### In the capture lab

- **Find the board** freezes the photo, as today. While the finder works, a
  list of its steps lights up one after another over the dimmed photo: the
  colours, the bull, the double ring, the tilt, which way is up, the wires.
  It follows `onStep`, and it is a loading screen, not a drawing of what was
  found.
- **Found:** today's calibrate screen, with the four markers already on the
  wire corners and the wireframe drawn. Then **Use this calibration**, **Find
  again** and **Cancel**. Dragging works as today, with the lens.
- **The verdict** sits in the coach's colours, with the numbers under a
  chevron, as the phone link light does:
  - green "Fits the wires";
  - amber "Check near the 3: drag a marker", naming the sector where the
    residuals are worst, when that area is clearly worse than the rest;
  - under the chevron: ring edges and wires measured, median and 90th
    percentile in mm.
- **Not found:** the markers start where they do today, from the current
  calibration or the default positions, with a line saying why: "Couldn't see
  the red and green rings: place the four markers by hand." **Find again** is
  there too.
- **"The camera has moved"**: the setup coach's message gets a **Find the board
  again** button, in the capture lab and in a game. It opens the calibrate step
  with the finder already run. It matters only when following the board (below)
  could not keep up, for example when the phone was knocked to a new place.

### Following the board during play

**When.** The board watcher already says when a settle's photo shows an empty
board: the settle that ends a pull-out ("emptied"), an empty settle, and an
early pull. On such a photo `boardDrift` runs `refine` from the current
calibration, in the worker; one check at a time. No extra photo is asked of
the phone, so a paired link carries nothing new. In a game the watcher judges
settles only while the autoscorer is scoring, so that is when the board is
followed; in the capture lab, during try-it.

**How far it moved.** The finder's new fit is compared with its fit at
calibration (`found`, or `toImage` when there is none). The shift is the
largest distance in board millimetres between where the two put the four
corners and the treble 20.

**What happens.**
- Under 1 mm: nothing. On the user's photos the finder repeats to 0.3–0.6 mm
  between photos taken within a minute, darts in the board and all, so this is
  noise. The design said 0.7 mm, from the spike's 0.3 mm; the measured jitter
  set it at 1.
- 1 mm or more, with a good fit: the calibration follows. The image-space
  motion between the two fits, `new · found⁻¹`, is applied to the person's
  calibration, so their dragged markers move with the board instead of being
  replaced by the finder's. `found` becomes the new fit. The calibration
  reference is retaken from the same empty photo, so the "moved" coach and the
  empty-board check compare with the board where it now is.
- `refine` fails (moved too far for a snap): `locate` runs from nothing. If it
  finds the board, the calibration follows as above. If not, nothing changes,
  and the coach goes on saying "the camera has moved", now with its button.

**Never mid-visit.** The new calibration is kept only if the board is still
empty when it is ready: the watcher's `quiet()` says no dart has gone in since
the photo, and no pull-out has begun. Otherwise the check is dropped ("late")
and the next empty board tries again. The board watcher already clears its
empty-board list when the calibration changes; the retaken reference is the
empty board it then compares with.

**Seen and logged.** Each check logs `[treblewise] board drift: 1.8 mm,
followed (212 edges, 78 wires)` (or stayed, late, lost). When it follows, the
camera panel under the badge's chevron says "Board moved 1.8 mm: followed".

**It is the board moving.** Run over the 2026-10-03 export in time order, the
found board drifts steadily within one calibration: 4.6 mm at the bottom
corner over 20 minutes in one session, 2 mm over 12 minutes in another, 1 to
4.6 mm across the nine. Between photos of the same visit it agrees with
itself to a few tenths of a millimetre. That is the phone sliding on its hook,
as the user suspected.

### Spike results

A Python and OpenCV version of steps 1 to 6 ran on the 2026-10-03 export:
9 calibrations, 4 photos each, 720×1280, steep angle, darts in the board.

- The board was found in **36 of 36** photos, in about 1.4 s each in Python.
- Feature residuals: median 1.0–1.2 mm, 90th percentile 2.5–3.7 mm. The tail
  is darts and the wires' own width.
- Across photos of the same calibration, the found corners agree to about
  0.3 mm.
- Against the hand calibrations, the corners are 1–9 mm apart (median 2.9 mm),
  and the treble 20 about 2 mm. Overlays show the found wireframe on the real
  wires and the hand one off them. The worst is the bottom corner, the one
  measured on 2026-10-27 as the hand calibration's worst.

### Results of the TypeScript finder

`npm run eval:find-board` on the same export, all 225 photos (all with one to
three darts in the board):

- Found in **224 of 225**, the miss reported as "no ring" rather than guessed.
- About 0.4 s a photo in Node (median), 1.3 s at worst. In Chrome, from the
  button press to the markers placed, including the paced loading steps,
  0.8 s on the laptop.
- Distance of each measurement from its circle or line: median 0.9–1.1 mm,
  90th percentile 2.1–2.5 mm, about a pixel at 0.7–1.4 px a millimetre.
- Jitter between photos within a minute: 0.3–0.6 mm. Drift over a session:
  1 to 4.6 mm (above).
- Against the hand calibrations: corners 1–9 mm apart, as in the spike, and
  the overlays again put the found board on the wires.
- The amber verdict did not fire on any of them.

## Alternatives

- **A trained keypoint model** (issue #24 as triaged, docs/03 model A, roadmap
  B2). It needs labelled photos from many boards, a training run on the GPU
  machine, and another ONNX file to ship. Its accuracy is bounded by the
  labels, which are hand calibrations off by 2–7 mm. The fit above needs no
  data and is measured against the wires themselves. Kept as the fallback if
  boards in other colours turn out to matter.
- **Refine only**, as rings.py did: snap an existing calibration onto the rings.
  That is step 5 alone. It cannot calibrate a new camera position, and the
  first calibration is the one that matters most.
- **Edges instead of colour** (Canny, then a Hough ellipse): it would work on any
  colours, but the number ring, the surround, the lamp and the wall give it
  far more to get wrong. Colour is the board's own signal.
- **OpenCV.js**: see above. Too big for what it would do here.

## Testing

- **Unit tests** in `packages/core/tests/vision/boardFinder/`, against a
  synthetic board rendered through a known homography into an RGBA buffer:
  face on, steep (like the user's camera), and rolled 15°. Variants add
  noise, a lighting gradient, dark lines across the rings for darts, and a
  missing quarter of the double ring. Expected: corners within 0.5 mm.
  Expected not found: a blank image, and a picture with no ring.
- **Step tests**: the ellipse fit on ellipses with known answers (exact, an
  arc only, ±1 px noise; not against `cv2.fitEllipse`, which uses another
  least-squares variant and so differs a little on noisy points), the RANSAC,
  the polar-line start (from an exact ellipse and centre, one turn of it is
  within 0.3 mm), the choice of turn, and refinement from a knocked-off
  homography. `raster/` is tested on small hand-made masks.
- **Real photos stay off the repo** (`.gitignore`: "your photographs, never
  committed"). A local script, `npm run eval:find-board -- <export.zip>`, runs
  the TypeScript finder on an export. Per calibration it prints whether the
  board was found, the residuals, the spread across photos, and the distance
  from the stored calibration, and it writes overlay images. The bar was the
  spike's 36/36; see *Results* for the whole export.
- **Timing**, in the eval script and in the browser on the laptop and on a
  phone (solo mode calibrates on the phone).
- **Following the board**: unit tests of `boardDrift` with boards moved by
  known amounts: under the margin nothing happens; over it the calibration
  follows, a hand adjustment made at calibration survives the move, and the
  reference is retaken; a dart going in first means no change; a snap that
  fails goes to a search from nothing. The board watcher's tests check which
  settles are handed on and when `quiet()` turns false.
- **Screenshots for review**, at each stage, before anything is merged:
  - the eval script's overlays of the found wireframe on the real exports,
    with the hand calibration beside it;
  - the capture lab in Chrome driven by Playwright, with a real photo from the
    export as a fake camera: the loading steps, found (green), not found (the
    painting under the board as the camera), and the coach's button after the
    phone moved. The amber verdict never came up on a real photo, so it is
    covered by a test only;
  - for following the board, before-and-after overlays of synthetic and real
    photos shifted by known amounts.

  They stay on the machine. Photos of the user's room are never uploaded
  anywhere without asking.
- **On the real board**: calibrate with it, check the overlay, play a few legs,
  and read the drift log.

## Delivery

One pull request: the finder and the capture lab, then following the board
during play, as separate commits.

## Open questions

Settled on 2026-10-30:

- It runs by itself when **Calibrate** is pressed, not behind a button.
- It replaces the trained board-pose model (issue #24 as triaged, docs/03
  "model A", roadmap B2), and the trained model stays only as a fallback for
  boards in other colours. The decision goes into the arc42 decision log when
  the docs are reorganised, after this feature.
- The calibrate screen: the markers already placed, **Use this calibration**,
  **Find again**, **Cancel**.
- The verdict: green or amber, naming where to check, numbers under a chevron.
- While finding: a list of the steps lighting up, a loading screen and not a
  drawing.
- The coach's "camera has moved" gets a **Find the board again** button.
- During play, the calibration follows the board by itself when it has moved
  past a margin. Each time, a short note goes under the camera badge's
  chevron, for example "Board moved 1.8 mm: followed", besides the log line.
