/**
 * The caller's recorded clips: one MP3 per phrase, back to back in one file,
 * with an index saying where each one starts (scripts/build-caller-pack.py).
 *
 * The file is fetched once, the first time the caller is needed; a clip is
 * decoded the first time it is said, and kept. Each clip is a whole MP3, so
 * decoding one needs nothing from the others.
 */

import { clipKey } from './call.js';

/**
 * How loud the clips play. The pack is mastered loud (about -13 LUFS), and the
 * browser's voice that says the names cannot be raised: the Windows voices
 * speak at -22 to -27 LUFS. About -12 dB brings the clips down to them, so a
 * name does not drop out between two clips.
 */
const CLIP_GAIN = 0.25;

export interface ClipIndex {
  voice: string;
  credit: string;
  licence: string;
  /** The MP3 holding every clip, named by its hash. */
  file: string;
  /** Byte offset and length of each clip, by clipKey(). */
  clips: Record<string, [number, number]>;
}

export interface Clips {
  /** Plays a phrase's clip and resolves once it has ended; false if there is none to play. */
  play(phrase: string): Promise<boolean>;
  /** Stops the clip being played, if any. */
  stop(): void;
  /** Gets a phrase's clip ready, so it starts at once when it is played. */
  prepare(phrase: string): void;
}

/** The pack under `base` (ending in a slash), or null if it cannot be had. */
export async function loadClips(audio: AudioContext, base: string): Promise<Clips | null> {
  try {
    const indexResponse = await fetch(`${base}index.json`, { cache: 'no-cache' });
    if (!indexResponse.ok) return null;
    const index = (await indexResponse.json()) as ClipIndex;
    const packResponse = await fetch(`${base}${index.file}`);
    if (!packResponse.ok) return null;
    return new WebAudioClips(audio, index, await packResponse.arrayBuffer());
  } catch {
    return null;
  }
}

class WebAudioClips implements Clips {
  private readonly decoded = new Map<string, Promise<AudioBuffer | null>>();
  private playing: AudioBufferSourceNode | null = null;
  private readonly output: GainNode;

  constructor(
    private readonly audio: AudioContext,
    private readonly index: ClipIndex,
    private readonly pack: ArrayBuffer,
  ) {
    this.output = audio.createGain();
    this.output.gain.value = CLIP_GAIN;
    this.output.connect(audio.destination);
  }

  async play(phrase: string): Promise<boolean> {
    const buffer = await this.buffer(clipKey(phrase));
    // A context the page has not been allowed to start yet would never end the clip.
    if (!buffer || this.audio.state !== 'running') return false;
    return new Promise((resolve) => {
      const source = this.audio.createBufferSource();
      source.buffer = buffer;
      source.connect(this.output);
      source.onended = () => {
        if (this.playing === source) this.playing = null;
        resolve(true);
      };
      this.playing = source;
      source.start();
    });
  }

  stop(): void {
    this.playing?.stop();
  }

  prepare(phrase: string): void {
    void this.buffer(clipKey(phrase));
  }

  private buffer(key: string): Promise<AudioBuffer | null> {
    let buffer = this.decoded.get(key);
    if (!buffer) {
      const at = this.index.clips[key];
      // decodeAudioData takes the bytes it is given, so it gets a copy.
      buffer = at ? this.audio.decodeAudioData(this.pack.slice(at[0], at[0] + at[1])).catch(() => null) : Promise.resolve(null);
      this.decoded.set(key, buffer);
    }
    return buffer;
  }
}
