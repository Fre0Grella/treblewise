/**
 * How the connection to the paired phone is doing, as a person can read it:
 * a colour, not a bitrate.
 *
 * The same phone, board and Wi-Fi gave two opposite sessions minutes apart,
 * one pairing and the next. In the bad one the video arrived at its full size
 * but smeared, photographs took four seconds instead of a tenth of one, and
 * the board never looked empty after the darts came out: every part of the
 * app that looks at the board was working from a picture that was not there.
 * Pairing again fixed it. Nothing on screen said any of this, so the light
 * says it: green, amber, or red with "pair again".
 *
 * The limits are starting points, from that one evening: the numbers behind
 * the light are shown under it, so a real session can correct them.
 */

export type LinkHealth = 'good' | 'slow' | 'bad';

/** What the light is judged on. Any of them may be missing: a browser that does not say, or not yet. */
export interface LinkReadings {
  /** How fast the phone reckons it can send, kbit/s (WebRTC's bandwidth estimate). */
  estimateKbps?: number;
  /** The video as it arrives, frames per second. */
  fps?: number;
  /** There and back between the two devices, ms. */
  rttMs?: number;
  /** How long a photograph takes to come over: the middle one of the last three, ms. */
  photoMs?: number;
}

export const LINK_LIMITS = {
  /** Under this a 720×1280 video is visibly smeared, and the board's thumbnails with it. */
  badKbps: 600,
  /** Under this it holds up while the board is still, and smears when anything moves. */
  slowKbps: 1500,
  /** Photographs took about 4 s in the bad session, 0.1 to 0.4 s in the good ones. */
  badPhotoMs: 1500,
  slowPhotoMs: 700,
  /** Over home Wi-Fi a round trip is a few milliseconds. */
  slowRttMs: 150,
  /**
   * Every connection starts its estimate low and climbs: for this long after
   * pairing the estimate is not held against it.
   */
  startUpMs: 15_000,
};

/** The light for these readings, or null when there is nothing to judge yet. */
export function linkHealth(readings: LinkReadings): LinkHealth | null {
  const { estimateKbps, photoMs, rttMs } = readings;
  if (estimateKbps === undefined && photoMs === undefined && rttMs === undefined) return null;
  if ((estimateKbps ?? Infinity) < LINK_LIMITS.badKbps || (photoMs ?? 0) >= LINK_LIMITS.badPhotoMs) return 'bad';
  if (
    (estimateKbps ?? Infinity) < LINK_LIMITS.slowKbps ||
    (photoMs ?? 0) >= LINK_LIMITS.slowPhotoMs ||
    (rttMs ?? 0) >= LINK_LIMITS.slowRttMs
  ) {
    return 'slow';
  }
  return 'good';
}

/**
 * The light to show, from the one shown and the latest judgement: a new
 * colour only once it has been judged twice running, so one slow photograph
 * or a dip of the estimate does not flash red.
 */
export function steadyHealth(
  shown: LinkHealth | null,
  pending: LinkHealth | null,
  judged: LinkHealth | null,
): { shown: LinkHealth | null; pending: LinkHealth | null } {
  if (judged === shown) return { shown, pending: null };
  // The first judgement is shown at once: there is nothing to flash from.
  if (shown === null || judged === pending) return { shown: judged, pending: null };
  return { shown, pending: judged };
}

/** The middle of the last few values, or undefined without any. */
export function middle(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
