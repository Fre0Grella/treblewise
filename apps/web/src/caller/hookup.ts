/**
 * The caller, hooked up to the match.
 *
 * The match says what there is to announce after every dart (store/matches.ts)
 * and knows nothing of speech; the voice says whatever it is given and knows
 * nothing of the match. This is the part between them: it speaks only while
 * the caller is switched on, and it falls silent when a dart is taken back,
 * whose score is no longer true, or when the caller is switched off.
 */

import { caller, type CallerVoice } from './caller.js';

export interface CallerHookup {
  /** What the match announced, in order: said if the caller is on. */
  heard(calls: readonly string[]): void;
  /** Stops whatever is being said. */
  hush(): void;
}

/** `isOn` is asked at each call, so switching the caller on or off takes effect at once. */
export function hookUpCaller(isOn: () => boolean, voice: () => CallerVoice = caller): CallerHookup {
  return {
    heard(calls) {
      if (calls.length > 0 && isOn()) voice().sequence([...calls]);
    },
    hush() {
      voice().cancel();
    },
  };
}
