/**
 * The game's sounds, under the caller: a dart going into the board, a bust,
 * and the turn passing to the next player.
 *
 * The dart and the glass of a bust are recordings, CC0 from Freesound
 * (docs/08-licensing-and-data.md), small enough to ship with the app; the
 * shards falling after the glass and the turn are synthesised with Web Audio.
 * They were picked by ear against the caller, at the levels below.
 *
 * Browsers keep audio silent until the page has had a real user gesture, so
 * `unlockSounds` is called from taps, the way `unlockCaller` is.
 */

import bustUrl from '../assets/sounds/bust-glass.mp3?url';
import dartUrl from '../assets/sounds/dart.wav?url';

let context: AudioContext | null = null;

/** The page's one audio context, shared with the caller's clips (clips.ts). */
export function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  context ??= new Context();
  return context;
}

export function unlockSounds(): void {
  const ctx = audioContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  loadSounds();
}

/**
 * How loud each sound plays. The recordings are quiet or loud as they came,
 * so each gain brings its peak to where it was picked: 35% of a peak of 0.8,
 * against the caller's clips (clips.ts). The dart peaks at -18.3 dB, the glass
 * at -4.1 dB; the shards are made at the level they were picked.
 */
const DART_GAIN = (0.8 / 0.122) * 0.35;
const GLASS_GAIN = (0.8 / 0.623) * 0.35;
const SHARDS_GAIN = 0.35 * 0.6;
/** The shards start falling just after the glass breaks. */
const SHARDS_AFTER = 0.08;

const samples: { dart: AudioBuffer | null; glass: AudioBuffer | null } = { dart: null, glass: null };
let loading: Promise<void> | null = null;

/**
 * Fetches and decodes the recordings, once. Called when the game opens, so
 * the first dart is heard: a context still waiting for a tap can decode.
 */
export function loadSounds(): Promise<void> {
  const ctx = audioContext();
  if (!ctx) return Promise.resolve();
  loading ??= (async () => {
    const decode = async (url: string) => {
      try {
        const response = await fetch(url);
        return response.ok ? await ctx.decodeAudioData(await response.arrayBuffer()) : null;
      } catch {
        return null;
      }
    };
    [samples.dart, samples.glass] = await Promise.all([decode(dartUrl), decode(bustUrl)]);
    // Not there (offline, say): try again the next time.
    if (!samples.dart || !samples.glass) loading = null;
  })();
  return loading;
}

function playSample(ctx: AudioContext, buffer: AudioBuffer | null, gain: number, at: number): void {
  if (!buffer) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const level = ctx.createGain();
  level.gain.value = gain;
  source.connect(level).connect(ctx.destination);
  source.start(at);
}

/** Plays when a dart goes into the board. */
export function playThud(): void {
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') return;
  playSample(ctx, samples.dart, DART_GAIN, ctx.currentTime);
}

/**
 * Plays when a dart busts the visit, with the dart: a pane of glass smashing,
 * and its shards falling and ringing after it, a little different every time.
 */
export function playBust(): void {
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  playSample(ctx, samples.glass, GLASS_GAIN, now);
  const level = ctx.createGain();
  level.gain.value = SHARDS_GAIN;
  level.connect(ctx.destination);
  shards(ctx, level, now + SHARDS_AFTER, 45, 1.1);
}

/** A short burst of white noise, the raw material of the shards' ticks. */
function noise(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** A gain that rises to `peak` at once and dies away over `decay` seconds. */
function envelope(ctx: AudioContext, node: AudioNode, at: number, peak: number, decay: number): GainNode {
  const attack = 0.002;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  node.connect(gain);
  return gain;
}

/**
 * Glass shards falling after a pane breaks: each one rings at a high pitch
 * with an overtone and ticks as it lands, many at first and fewer as they
 * thin out, the later ones quieter.
 */
function shards(ctx: AudioContext, out: AudioNode, t: number, count: number, length: number): void {
  const ring = (at: number, frequency: number, peak: number, decay: number) => {
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(frequency, at);
    envelope(ctx, tone, at, peak, decay).connect(out);
    tone.start(at);
    tone.stop(at + decay + 0.05);
  };
  for (let i = 0; i < count; i += 1) {
    const at = t + length * Math.pow(Math.random(), 1.4);
    const base = 2500 + Math.random() * 6000;
    const peak = 0.05 + Math.random() * 0.2 * (1 - ((at - t) / length) * 0.8);
    const decay = 0.03 + Math.random() * 0.2;
    ring(at, base, peak, decay);
    ring(at, base * (1.6 + Math.random() * 0.7), peak * 0.4, decay * 0.6);

    const tick = ctx.createBufferSource();
    tick.buffer = noise(ctx, 0.01);
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 4500;
    high.Q.value = 0.7;
    tick.connect(high);
    envelope(ctx, high, at, peak, 0.006).connect(out);
    tick.start(at);
    tick.stop(at + 0.01);
  }
}

/** The turn passing: two soft rising notes, unmistakable and not a dart. */
export function playTurn(): void {
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  [
    { at: 0, frequency: 660 },
    { at: 0.14, frequency: 990 },
  ].forEach(({ at, frequency }) => {
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.35, now + at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.32);
    tone.connect(gain).connect(ctx.destination);
    tone.start(now + at);
    tone.stop(now + at + 0.34);
  });
}
