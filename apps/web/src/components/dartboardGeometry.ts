/**
 * The drawn board's geometry, in board millimetres: the beds, where the
 * numbers go, and where the magnifying lens sits. No framework: the board
 * component draws it (Dartboard.vue).
 */

import { BOARD, SECTORS, sectorAngle } from '@treblewise/core';

export const R = BOARD.boardRadius;
const HALF_SECTOR = 9;

/** Lens geometry, in board millimetres. */
export const LENS = {
  radius: 58,
  magnification: 3.2,
  /** How far the lens sits from the finger: clear of a fingertip, still close. */
  offset: 96,
};

/** The board's colours live in global.css, with the rest of the palette. */
export const COLOURS = {
  surround: 'var(--board-surround)',
  dark: 'var(--board-black)',
  light: 'var(--board-beige)',
  red: 'var(--board-red)',
  green: 'var(--board-green)',
  wire: 'var(--board-wire)',
  number: 'var(--board-number)',
  marker: 'var(--dart-marker)',
  ink: 'var(--mark-ink)',
  plate: 'var(--mark-shade-strong)',
};

const rad = (deg: number) => (deg * Math.PI) / 180;

/** A point in SVG space: board millimetres with the y axis flipped. */
function svgPoint(r: number, deg: number): string {
  return `${(r * Math.cos(rad(deg))).toFixed(2)},${(-r * Math.sin(rad(deg))).toFixed(2)}`;
}

/** The ring segment between two radii and two angles (angles anticlockwise). */
function bed(r1: number, r2: number, from: number, to: number): string {
  return [
    `M ${svgPoint(r2, from)}`,
    `A ${r2} ${r2} 0 0 0 ${svgPoint(r2, to)}`,
    `L ${svgPoint(r1, to)}`,
    `A ${r1} ${r1} 0 0 1 ${svgPoint(r1, from)}`,
    'Z',
  ].join(' ');
}

export interface Bed {
  key: string;
  d: string;
  fill: string;
}

export function buildBeds(): Bed[] {
  const beds: Bed[] = [];

  SECTORS.forEach((sector, index) => {
    const centre = sectorAngle(sector);
    const from = centre - HALF_SECTOR;
    const to = centre + HALF_SECTOR;
    const isDark = index % 2 === 0;
    const single = isDark ? COLOURS.dark : COLOURS.light;
    const ring = isDark ? COLOURS.red : COLOURS.green;

    beds.push(
      { key: `s-in-${sector}`, d: bed(BOARD.outerBullRadius, BOARD.trebleInnerRadius, from, to), fill: single },
      { key: `t-${sector}`, d: bed(BOARD.trebleInnerRadius, BOARD.trebleOuterRadius, from, to), fill: ring },
      { key: `s-out-${sector}`, d: bed(BOARD.trebleOuterRadius, BOARD.doubleInnerRadius, from, to), fill: single },
      { key: `d-${sector}`, d: bed(BOARD.doubleInnerRadius, BOARD.doubleOuterRadius, from, to), fill: ring },
    );
  });

  return beds;
}

/** Where each sector's number goes, in SVG coordinates. */
export function numberPositions(): { sector: number; x: number; y: number }[] {
  return SECTORS.map((sector) => {
    const angle = rad(sectorAngle(sector));
    const r = (BOARD.doubleOuterRadius + BOARD.boardRadius) / 2;
    return { sector, x: r * Math.cos(angle), y: -r * Math.sin(angle) };
  });
}

export interface LensPlacement {
  cx: number;
  cy: number;
}

/**
 * Where to put the lens: directly above the finger, always, with no exceptions.
 *
 * An earlier version moved it sideways near the top of the board and below it
 * in the corners, to keep the whole lens inside the board's frame. That was
 * worse than the problem: crossing the 20 made it jump from one side to the
 * other, and a lens you have to re-find with your eyes is not a lens.
 *
 * So it never moves relative to the finger, and is allowed to float past the
 * edge of the board instead — the SVG is `overflow: visible` — exactly as a
 * phone's text loupe floats over whatever happens to be above it.
 *
 * Works in SVG coordinates, so "above" means a smaller y.
 */
export function placeLens(point: { x: number; y: number }, offset = LENS.offset): LensPlacement {
  return { cx: point.x, cy: point.y - offset };
}

/**
 * A pointer position as a board position, in millimetres. The viewBox is
 * square and centred on the bull, so screen → board is a scale and a y flip.
 */
export function boardPointAt(rect: DOMRect, clientX: number, clientY: number): { x: number; y: number } | null {
  const size = Math.min(rect.width, rect.height);
  if (size === 0) return null;
  const originX = rect.left + (rect.width - size) / 2;
  const originY = rect.top + (rect.height - size) / 2;
  return {
    x: ((clientX - originX) / size) * 2 * R - R,
    y: -(((clientY - originY) / size) * 2 * R - R),
  };
}
