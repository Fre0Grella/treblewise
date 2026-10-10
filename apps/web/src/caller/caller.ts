/**
 * The caller: says the score out loud so nobody has to look at the screen.
 *
 * The words come from recorded clips (clips.ts), one voice on every device. A
 * player's name cannot be recorded in advance, so the browser's own speech says
 * it, in whatever voice the device has. The words fall back to the browser's
 * speech only while there are no clips (offline on the first visit, say), and
 * then only in a voice of the app's language: an English score read by an
 * Italian voice is worse than silence (docs/06-voice.md).
 */

import { strings } from '../i18n/index.js';

import { callText, leadingPause, type Call } from './call.js';
import { loadClips, type Clips } from './clips.js';
import { audioContext, unlockSounds } from './sounds.js';

export interface CallerVoice {
  /** Says a call, interrupting whatever was being said. */
  say(call: Call): void;
  /** Says calls one after another with natural gaps, as a caller does. */
  sequence(calls: readonly Call[]): void;
  cancel(): void;
  readonly available: boolean;
}

/** The browser's speech, as the caller uses it. */
export interface Speech {
  readonly available: boolean;
  /**
   * Says `text` and resolves once it is said. A name can be said in any
   * voice; words only in one of the app's language, or not at all.
   */
  say(text: string, kind: 'name' | 'words'): Promise<void>;
  cancel(): void;
}

/** The pause between two calls, and between a name and the words after it. */
const CALL_GAP_MS = 300;
const PART_GAP_MS = 80;

/** The caller speaks a little slower than conversation. */
const SPEECH_RATE = 0.95;

/**
 * How long the browser takes to say a name, from its start: measured on the
 * Windows voices, which take 0.45 s for "Ann" and 1.45 s for "Maximiliano
 * Rossi", rounded up. They then go on with most of a second of silence before
 * saying they have finished, which left a gap before the words after a name;
 * the words start once this has passed instead.
 */
export function nameSeconds(name: string): number {
  return (0.4 + 0.07 * name.length) / SPEECH_RATE;
}

export class ClipCaller implements CallerVoice {
  private run = 0;
  private clips: Clips | null = null;

  constructor(
    private readonly loadClips: () => Promise<Clips | null>,
    private readonly speech: Speech,
    readonly available: boolean,
    private readonly wait: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
  ) {}

  say(call: Call): void {
    this.sequence([call]);
  }

  sequence(calls: readonly Call[]): void {
    this.cancel();
    void this.play(calls, this.run);
  }

  cancel(): void {
    this.run += 1;
    this.clips?.stop();
    this.speech.cancel();
  }

  private async play(calls: readonly Call[], run: number): Promise<void> {
    this.clips = await this.loadClips();
    for (const [index, call] of calls.entries()) {
      if (index > 0) await this.wait(CALL_GAP_MS);
      if (run !== this.run) return;
      if (!this.clips) {
        const pause = leadingPause(call);
        if (pause > 0) await this.wait(pause);
        if (run !== this.run) return;
        await this.speech.say(callText(call), 'words');
        continue;
      }
      // Decoded while the name before them is said, so they follow it at once.
      for (const part of call) if (typeof part === 'string') this.clips.prepare(part);
      let spoken = false;
      for (const part of call) {
        if (typeof part !== 'string' && 'pause' in part) {
          await this.wait(part.pause);
          if (run !== this.run) return;
          spoken = false;
          continue;
        }
        // A short breath between a name and its words; a pause is its own gap.
        if (spoken) await this.wait(PART_GAP_MS);
        if (run !== this.run) return;
        if (typeof part !== 'string') await this.speech.say(part.name, 'name');
        else if (!(await this.clips.play(part))) await this.speech.say(part, 'words');
        spoken = true;
      }
    }
  }
}

class BrowserSpeech implements Speech {
  readonly available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  private local: SpeechSynthesisVoice | null = null;

  constructor(private readonly locale: string) {
    if (!this.available) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      this.local =
        voices.find((v) => v.lang.toLowerCase().startsWith(this.locale) && v.localService) ??
        voices.find((v) => v.lang.toLowerCase().startsWith(this.locale)) ??
        null;
    };
    pick();
    window.speechSynthesis.addEventListener('voiceschanged', pick);
  }

  say(text: string, kind: 'name' | 'words'): Promise<void> {
    if (!this.available || (kind === 'words' && !this.local)) return Promise.resolve();
    return new Promise((done) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = SPEECH_RATE;
      utterance.volume = 1;
      if (this.local) utterance.voice = this.local;
      if (kind === 'name') utterance.onstart = () => setTimeout(done, nameSeconds(text) * 1000);
      utterance.onend = () => done();
      utterance.onerror = () => done();
      // Some browsers never say they have finished; the call must go on anyway.
      setTimeout(done, 1500 + 120 * text.length);
      window.speechSynthesis.speak(utterance);
    });
  }

  cancel(): void {
    if (this.available) window.speechSynthesis.cancel();
  }
}

let instance: CallerVoice | null = null;
const packs = new Map<string, Promise<Clips | null>>();

function clipsFor(locale: string): Promise<Clips | null> {
  let pack = packs.get(locale);
  if (!pack) {
    const audio = audioContext();
    pack = audio ? loadClips(audio, `${import.meta.env.BASE_URL}caller/${locale}/`) : Promise.resolve(null);
    packs.set(locale, pack);
    // Not there (offline on the first visit): try again at the next call.
    void pack.then((clips) => {
      if (!clips) packs.delete(locale);
    });
  }
  return pack;
}

export function caller(): CallerVoice {
  if (!instance) {
    const locale = strings().locale;
    const speech = new BrowserSpeech(locale);
    instance = new ClipCaller(() => clipsFor(locale), speech, audioContext() !== null || speech.available);
  }
  return instance;
}

/**
 * Browsers keep audio and speech silent until the page has had a real user
 * gesture. Calling this from taps makes the first call work, and starts
 * fetching the clips, so they are there by the end of the first visit.
 */
export function unlockCaller(): void {
  unlockSounds();
  void clipsFor(strings().locale);
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance('');
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
}
