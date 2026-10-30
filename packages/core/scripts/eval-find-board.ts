/**
 * Runs the board finder on a capture-lab export, to see how it does on real
 * photographs. They never go in the repository, so this is a local check,
 * not a test.
 *
 *   npm run eval:find-board -- <export.zip> [out folder] [photos per calibration]
 *
 * For each calibration in the export it prints how often the board was found,
 * how well the fit sits on the wires, how much the found corners move between
 * photos taken within a minute of each other (the finder's own jitter), how
 * far they moved over the whole session (the board or the phone moving: on the
 * user's hook the phone slides a few millimetres in twenty minutes), and how
 * far they are from the calibration stored with the photos, placed by hand. It writes
 * an overlay per calibration: the found board in cyan, the stored one in red.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { unzipSync } from 'fflate';
import jpeg from 'jpeg-js';

import { CALIBRATION_BOARD_POINTS, boardWireframe } from '../src/vision/calibration.js';
import { applyHomography, invertHomography, type Matrix3 } from '../src/vision/homography.js';
import { findBoard, type FoundBoard } from '../src/vision/boardFinder/index.js';
import type { RgbaImage } from '../src/vision/boardFinder/raster/masks.js';
import type { Point } from '../src/board/geometry.js';

interface Frame {
  file: string;
  ts: number;
  width: number;
  height: number;
  calibration: { toImage: Matrix3 };
}

const [zipPath, outArg, perArg] = process.argv.slice(2);
if (!zipPath) {
  console.error('usage: npm run eval:find-board -- <export.zip> [out folder] [photos per calibration]');
  process.exit(1);
}
const out = outArg ?? join(tmpdir(), 'treblewise-find-board');
const perCalibration = perArg ? Number(perArg) : Number.POSITIVE_INFINITY;
mkdirSync(out, { recursive: true });

const files = unzipSync(readFileSync(zipPath));
const labels = JSON.parse(new TextDecoder().decode(files['labels.json']!)) as { frames: Frame[] };
const groups = new Map<string, Frame[]>();
for (const frame of labels.frames) {
  const key = frame.calibration.toImage.map((v) => v.toFixed(2)).join(',');
  groups.set(key, [...(groups.get(key) ?? []), frame]);
}

function decode(file: string): RgbaImage {
  const raw = jpeg.decode(files[file]!, { useTArray: true, formatAsRGBA: true });
  return { data: raw.data, width: raw.width, height: raw.height };
}

/** Board millimetres, under `toBoard`, of points in the image. */
const onBoard = (toBoard: Matrix3, points: Point[]) => points.map((p) => applyHomography(toBoard, p));
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? Number.NaN;
const fixed = (v: number, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits) : '—');

/** The image twice the size, with the wireframes drawn over it. */
function overlay(image: RgbaImage, boards: Array<[Matrix3, [number, number, number]]>): Uint8Array {
  const scale = 2;
  const width = image.width * scale;
  const height = image.height * scale;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (Math.floor(y / scale) * image.width + Math.floor(x / scale)) * 4;
      data.set(image.data.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  const dot = (x: number, y: number, colour: [number, number, number]) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi >= 0 && yi >= 0 && xi < width && yi < height) data.set([...colour, 255], (yi * width + xi) * 4);
  };
  for (const [toImage, colour] of boards) {
    for (const line of boardWireframe()) {
      for (let i = 0; i + 1 < line.length; i += 1) {
        const a = applyHomography(toImage, line[i]!);
        const b = applyHomography(toImage, line[i + 1]!);
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * scale * 2) + 1;
        for (let s = 0; s <= steps; s += 1) dot((a.x + ((b.x - a.x) * s) / steps) * scale, (a.y + ((b.y - a.y) * s) / steps) * scale, colour);
      }
    }
  }
  return jpeg.encode({ data, width, height }, 90).data;
}

let found = 0;
let total = 0;
const times: number[] = [];
console.log('calibration  found   fit median / p90 mm   jitter mm   drift mm   vs stored, per corner mm (top right bottom left)');
let index = 0;
for (const frames of groups.values()) {
  const stored = frames[0]!.calibration.toImage;
  const storedBack = invertHomography(stored)!;
  const results: Array<{ frame: Frame; image: RgbaImage; result: FoundBoard }> = [];
  const tried = [...frames].sort((a, b) => a.ts - b.ts).slice(0, perCalibration);
  for (const frame of tried) {
    const image = decode(frame.file);
    const started = performance.now();
    const result = findBoard(image);
    times.push(performance.now() - started);
    if ('notFound' in result) {
      console.log(`  ${frame.file}: not found (${result.notFound})`);
      continue;
    }
    results.push({ frame, image, result });
  }
  total += tried.length;
  found += results.length;

  // Every found corner in board millimetres under the stored calibration. How
  // far apart two photos' corners are, at the corner that moved most.
  const corners = results.map(({ result }) => onBoard(storedBack, result.imagePoints));
  const apart = (a: Point[], b: Point[]) => Math.max(...a.map((p, c) => Math.hypot(p.x - b[c]!.x, p.y - b[c]!.y)));
  const jitter: number[] = [];
  for (let i = 1; i < results.length; i += 1) {
    if (results[i]!.frame.ts - results[i - 1]!.frame.ts < 60_000) jitter.push(apart(corners[i]!, corners[i - 1]!));
  }
  const drift = Math.max(0, ...corners.map((p) => apart(p, corners[0]!)));
  const vsStored = CALIBRATION_BOARD_POINTS.map((landmark, c) =>
    median(corners.map((p) => Math.hypot(p[c]!.x - landmark.x, p[c]!.y - landmark.y))),
  );
  console.log(
    `${String(index).padStart(5)}        ${results.length}/${tried.length}`.padEnd(22) +
      `${fixed(median(results.map((r) => r.result.fit.medianMm)), 2)} / ${fixed(Math.max(...results.map((r) => r.result.fit.p90Mm)), 2)}`.padEnd(22) +
      `${fixed(median(jitter), 2)}`.padEnd(12) +
      `${fixed(drift, 1)}`.padEnd(11) +
      vsStored.map((v) => fixed(v)).join('  ') +
      (results.some((r) => r.result.fit.worstSector) ? `   check near ${results.find((r) => r.result.fit.worstSector)!.result.fit.worstSector}` : ''),
  );
  const first = results[0];
  if (first) {
    const path = join(out, `calibration-${index}.jpg`);
    writeFileSync(path, overlay(first.image, [[stored, [255, 40, 40]], [first.result.toImage, [0, 240, 255]]]));
  }
  index += 1;
}
console.log(`\nfound ${found}/${total}; median ${fixed(median(times), 0)} ms, slowest ${fixed(Math.max(...times), 0)} ms a photo`);
console.log(`overlays (cyan found, red stored) in ${out}`);
