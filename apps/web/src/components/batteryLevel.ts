/**
 * The paired phone's battery, as it is worth showing. The phone reports it
 * every 30 seconds; low and not charging, it becomes a warning, so a match
 * does not lose its camera without notice.
 */

/** Under this, and not charging, the phone is about to stop filming. */
export const LOW_BATTERY = 20;

/**
 * The battery level worth showing, or undefined.
 *
 * "100%, charging" is left out: some phone browsers report exactly that,
 * always, whatever the battery is doing (Brave does, against fingerprinting),
 * and a phone that really is full and on its charger needs no word either.
 * The two cannot be told apart, so neither is shown.
 */
export function shownBattery(phone: { battery?: number; charging?: boolean } | null): number | undefined {
  if (phone?.battery === undefined) return undefined;
  if (phone.battery >= 100 && phone.charging) return undefined;
  return phone.battery;
}
