/**
 * A value drawn over the board: where the darts went, or where they would be
 * worth the most.
 *
 * The grid is painted into a canvas and shown as one image rather than eight
 * thousand rectangles, which is the difference between a page that scrolls and
 * one that does not. The board's wires go on top as a thin wireframe so a
 * bright patch can be read as "the treble 19" rather than "up and to the left".
 */

import { BOARD, boardWireframe, type BoardGrid, type Point } from '@treblewise/core';
import { useMemo } from 'react';

const R = BOARD.boardRadius;

/**
 * One hue, dark to light, for a dark surface: a sequential yellow ramp, the
 * tokens --heat-1 to --heat-5 in global.css. Values below the first stop stay
 * transparent so the board itself shows through where nothing happened.
 */
const RAMP_TOKENS = ['--heat-1', '--heat-2', '--heat-3', '--heat-4', '--heat-5'] as const;

type Rgb = [number, number, number];

/**
 * The ramp as numbers, read from the page's tokens: a canvas is painted pixel
 * by pixel and cannot take `var()`. The tokens are plain `#rrggbb` for this.
 */
function readRamp(): Rgb[] {
  const style = getComputedStyle(document.documentElement);
  return RAMP_TOKENS.map((name) => {
    const hex = style.getPropertyValue(name).trim().replace('#', '');
    return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)) as Rgb;
  });
}

function rampColour(ramp: Rgb[], t: number): [number, number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (ramp.length - 1);
  const index = Math.min(ramp.length - 2, Math.floor(scaled));
  const frac = scaled - index;
  const a = ramp[index]!;
  const b = ramp[index + 1]!;
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
    // Fade out the bottom of the scale so "nothing here" reads as nothing.
    Math.round(255 * Math.min(1, 0.15 + clamped * 1.4)),
  ];
}

export interface BoardMarker {
  point: Point;
  label: string;
  kind?: 'best' | 'plain';
}

export interface BoardMapProps {
  grid: BoardGrid;
  /** Values at or below this are drawn as empty. */
  floor?: number;
  /** Divides every value; defaults to the grid's own maximum. */
  scale?: number;
  markers?: BoardMarker[];
  label: string;
}

export function BoardMap({ grid, floor = 0.02, scale, markers = [], label }: BoardMapProps) {
  const image = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = grid.size;
    canvas.height = grid.size;
    const context = canvas.getContext('2d');
    if (!context) return null; // no canvas (tests): the wireframe still renders

    const ramp = readRamp();
    const peak = scale ?? Math.max(...grid.values, 1e-6);
    const pixels = context.createImageData(grid.size, grid.size);

    for (let iy = 0; iy < grid.size; iy += 1) {
      for (let ix = 0; ix < grid.size; ix += 1) {
        const value = grid.values[iy * grid.size + ix]! / peak;
        // The grid's y runs up the board; an image's runs down it.
        const at = ((grid.size - 1 - iy) * grid.size + ix) * 4;
        if (value <= floor) {
          pixels.data[at + 3] = 0;
          continue;
        }
        const [r, g, b, a] = rampColour(ramp, value);
        pixels.data[at] = r;
        pixels.data[at + 1] = g;
        pixels.data[at + 2] = b;
        pixels.data[at + 3] = a;
      }
    }

    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL();
  }, [grid, floor, scale]);

  const wires = useMemo(
    () =>
      boardWireframe().map((line) =>
        line.map((point) => `${point.x.toFixed(1)},${(-point.y).toFixed(1)}`).join(' '),
      ),
    [],
  );

  return (
    <svg className="board-map" viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} role="img" aria-label={label}>
      <circle cx={0} cy={0} r={R} fill="var(--board-backdrop)" />
      {image && (
        <image
          href={image}
          x={-grid.half}
          y={-grid.half}
          width={grid.half * 2}
          height={grid.half * 2}
          style={{ imageRendering: 'auto' }}
        />
      )}

      <g fill="none" stroke="var(--map-wire)" strokeWidth={0.7} opacity={0.22}>
        {wires.map((points, index) => (
          <polyline key={index} points={points} />
        ))}
      </g>

      <g fill="var(--map-number)" fontSize={15} textAnchor="middle" opacity={0.7}>
        {[20, 6, 3, 11].map((sector, index) => {
          const angle = [90, 0, 270, 180][index]!;
          const r = (BOARD.doubleOuterRadius + R) / 2;
          return (
            <text
              key={sector}
              x={r * Math.cos((angle * Math.PI) / 180)}
              y={-r * Math.sin((angle * Math.PI) / 180) + 5}
            >
              {sector}
            </text>
          );
        })}
      </g>

      {markers.map((marker) => (
        <g key={marker.label}>
          <circle
            cx={marker.point.x}
            cy={-marker.point.y}
            r={marker.kind === 'best' ? 13 : 9}
            fill="none"
            stroke="var(--mark-ink)"
            strokeWidth={marker.kind === 'best' ? 3 : 2}
          />
          <text
            x={marker.point.x}
            y={-marker.point.y - 19}
            fill="var(--mark-ink)"
            fontSize={17}
            fontWeight={700}
            textAnchor="middle"
            paintOrder="stroke"
            stroke="var(--mark-shade-strong)"
            strokeWidth={4}
          >
            {marker.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** The ramp as CSS stops, for a legend next to the map. */
export function rampStops(): string {
  return RAMP_TOKENS.map((name, index) => `var(${name}) ${(index / (RAMP_TOKENS.length - 1)) * 100}%`).join(', ');
}
