/**
 * The model's detections, less the darts already in the board: what is left
 * may be a new dart (see autoscore.ts, which reads a photograph with it).
 */

/**
 * How far the model's reading of a carried dart may sit from its mark and still
 * be that dart: the mark is a person's tap and the reading the model's, and
 * the two differ by a few millimetres.
 */
export const SAME_DART_MM = 10;

/**
 * The model's detections that are new darts. Each carried mark claims the one
 * detection nearest to it, if any is within SAME_DART_MM, nearest pair first;
 * everything left over is a candidate for the new dart.
 *
 * One each, not every detection within reach: three darts in the treble 20 sit
 * a few millimetres apart, and a mark that swallowed every detection around it
 * would hide the second and third dart of exactly the visit that matters most.
 *
 * The carried marks stay as they are: they were placed or confirmed by a
 * person, and the model's reading of an old dart must never move one.
 */
export function proposalsBeside<T extends { board: { x: number; y: number } }>(
  detections: readonly T[],
  carried: readonly { board: { x: number; y: number } }[],
): T[] {
  const pairs: { distance: number; mark: number; detection: number }[] = [];
  carried.forEach((dart, mark) =>
    detections.forEach((found, detection) => {
      const distance = Math.hypot(dart.board.x - found.board.x, dart.board.y - found.board.y);
      if (distance <= SAME_DART_MM) pairs.push({ distance, mark, detection });
    }),
  );
  pairs.sort((a, b) => a.distance - b.distance);

  const marksTaken = new Set<number>();
  const claimed = new Set<number>();
  for (const { mark, detection } of pairs) {
    if (marksTaken.has(mark) || claimed.has(detection)) continue;
    marksTaken.add(mark);
    claimed.add(detection);
  }
  return detections.filter((_, index) => !claimed.has(index));
}
