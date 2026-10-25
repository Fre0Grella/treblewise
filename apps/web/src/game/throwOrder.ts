/**
 * Who throws first (issue #41): set by hand, thrown for at the bull, or left
 * to a spin of the wheel. Each ends as the players in throwing order, the
 * first of them starting the match; the core rotates who starts each later
 * leg from there (x01.ts `startingPlayerFor`).
 */

import type { Hit, PlayerConfig, Point } from '@treblewise/core';

/** `list` with the item at `from` moved to `to`. */
export function moveTo<T>(list: readonly T[], from: number, to: number): T[] {
  const moved = [...list];
  const [item] = moved.splice(from, 1);
  if (item === undefined) return moved;
  moved.splice(Math.max(0, Math.min(to, moved.length)), 0, item);
  return moved;
}

/** The players in the same turn, starting with `id`: whoever followed them still does. */
export function startingWith(players: readonly PlayerConfig[], id: string): PlayerConfig[] {
  const at = players.findIndex((player) => player.id === id);
  return at <= 0 ? [...players] : [...players.slice(at), ...players.slice(0, at)];
}

/** One player's dart at the bull. */
export interface BullThrow {
  id: string;
  hit: Hit;
  /** Where it landed, in board millimetres from the centre of the bull. */
  pos: Point;
}

export type BullResult =
  /** Everyone in order, closest to the bull first. */
  | { kind: 'decided'; order: string[] }
  /** These were equally close, and throw again; the rest wait. */
  | { kind: 'tie'; tied: string[] };

const distance = (pos: Point) => Math.hypot(pos.x, pos.y);
const inBull = (hit: Hit) => hit.ring === 'bull' || hit.ring === 'outerBull';

/**
 * Who is closest, from one round of darts at the bull. Two darts in the same
 * bull (both in the 50, or both in the 25) are a tie, as they are in a match:
 * the board's own wire is the only judge anyone has. Outside it, the closer
 * dart wins.
 */
function rank(round: readonly BullThrow[]): { order: string[]; tied: string[] } {
  const sorted = [...round].sort((a, b) => distance(a.pos) - distance(b.pos));
  const best = sorted[0];
  if (!best) return { order: [], tied: [] };
  const tied = sorted
    .filter((thrown) =>
      inBull(best.hit) ? thrown.hit.ring === best.hit.ring : distance(thrown.pos) === distance(best.pos),
    )
    .map((thrown) => thrown.id);
  return { order: sorted.map((thrown) => thrown.id), tied };
}

/**
 * The bull-off so far: the first round is everyone's dart; each round after
 * it is the tied players throwing again, until one of them is closest. Those
 * left out of a tie keep the order of their first dart, after the tied ones.
 */
export function bullOff(rounds: readonly (readonly BullThrow[])[]): BullResult {
  const [first, ...rest] = rounds;
  if (!first) return { kind: 'tie', tied: [] };
  const { order, tied } = rank(first);
  if (tied.length <= 1) return { kind: 'decided', order };
  if (rest.length === 0) return { kind: 'tie', tied };
  const again = bullOff(rest);
  if (again.kind === 'tie') return again;
  return { kind: 'decided', order: [...again.order, ...order.filter((id) => !tied.includes(id))] };
}

/** A whole number from 0 to `n - 1`, evenly: the wheel's pick. */
export function pickOne(n: number, random: () => number = Math.random): number {
  return Math.min(n - 1, Math.floor(random() * n));
}

/**
 * How far to turn the wheel, in degrees clockwise, to stop on segment
 * `index` of `n` under the pointer at the top: a few whole turns for the
 * show, and a little way off the segment's middle (`jitter`, -1 to 1), so it
 * does not always stop dead centre.
 */
export function wheelTurn(index: number, n: number, turns = 5, jitter = 0): number {
  const segment = 360 / n;
  return turns * 360 + 360 - (index + 0.5) * segment - jitter * segment * 0.35;
}
