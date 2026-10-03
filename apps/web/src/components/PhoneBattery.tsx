/**
 * The paired phone's battery, where the camera's status is shown: during a
 * game and in the camera setup, not only in the lobby. The phone reports it
 * every 30 seconds. Low and not charging, it turns into a warning, so a match
 * does not lose its camera without notice.
 */

import { fill, useStrings } from '../i18n/index.js';
import { useMatchStore } from '../store/match.js';

/** Under this, and not charging, the phone is about to stop filming. */
export const LOW_BATTERY = 20;

export function PhoneBattery() {
  const t = useStrings();
  const phone = useMatchStore((s) => s.phone);
  const session = useMatchStore((s) => s.session);
  const pairState = useMatchStore((s) => s.pairState);
  const pairing = useMatchStore((s) => s.pairing);

  const live = session === 'paired' && pairing !== null && (pairState === 'connected' || pairState === 'connecting');
  if (!live || phone?.battery === undefined) return null;

  const low = phone.battery < LOW_BATTERY && !phone.charging;
  const text = fill(t.lobby.battery, { n: phone.battery, charging: phone.charging ? t.lobby.charging : '' });
  return low ? (
    <p className="warning" role="status">
      {fill(t.camera.batteryLow, { n: phone.battery })}
    </p>
  ) : (
    <span className="phone-battery">{text}</span>
  );
}
