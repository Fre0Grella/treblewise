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
  /**
   * Plays a phrase's clip and resolves once its words are said, while the
   * room's tail is still ringing under what comes next; false if there is
   * none to play.
   */
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
  private readonly decoded = new Map<string, Promise<Clip | null>>();
  /** Clips still sounding: one being said, and the tails of those before it. */
  private readonly playing = new Set<AudioBufferSourceNode>();
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
    const clip = await this.buffer(clipKey(phrase));
    // A context the page has not been allowed to start yet would never end the clip.
    if (!clip || this.audio.state !== 'running') return false;
    return new Promise((resolve) => {
      const source = this.audio.createBufferSource();
      source.buffer = clip.buffer;
      source.connect(this.output);
      const done = () => {
        clearTimeout(said);
        resolve(true);
      };
      const said = setTimeout(done, clip.spoken * 1000);
      source.onended = () => {
        this.playing.delete(source);
        done();
      };
      this.playing.add(source);
      source.start();
    });
  }

  stop(): void {
    for (const source of this.playing) source.stop();
  }

  prepare(phrase: string): void {
    void this.buffer(clipKey(phrase));
  }

  private buffer(key: string): Promise<Clip | null> {
    let clip = this.decoded.get(key);
    if (!clip) {
      const at = this.index.clips[key];
      // decodeAudioData takes the bytes it is given, so it gets a copy.
      clip = at
        ? this.audio
            .decodeAudioData(this.pack.slice(at[0], at[0] + at[1]))
            .then((buffer) => ({ buffer, spoken: spokenLength(buffer) }))
            .catch(() => null)
        : Promise.resolve(null);
      this.decoded.set(key, clip);
    }
    return clip;
  }
}

interface Clip {
  buffer: AudioBuffer;
  /** Seconds until the words are said: the rest is the room dying away. */
  spoken: number;
}

/**
 * Where a clip's words end: the end of the last stretch within 30 dB of its
 * loudest. Every clip carries half a second of room after its words, and a
 * name or the next call waiting for that sounded cut off from it.
 */
export function spokenLength(buffer: { sampleRate: number; length: number; getChannelData(channel: number): Float32Array }): number {
  const data = buffer.getChannelData(0);
  const window = Math.max(1, Math.round(buffer.sampleRate * 0.02));
  const energy: number[] = [];
  for (let start = 0; start < data.length; start += window) {
    let sum = 0;
    const end = Math.min(data.length, start + window);
    for (let i = start; i < end; i += 1) sum += data[i]! * data[i]!;
    energy.push(sum / (end - start));
  }
  const loudest = Math.max(...energy);
  const floor = loudest * 10 ** (-30 / 10);
  let last = energy.length - 1;
  while (last > 0 && energy[last]! < floor) last -= 1;
  return Math.min(buffer.length / buffer.sampleRate, ((last + 1) * window) / buffer.sampleRate);
}
