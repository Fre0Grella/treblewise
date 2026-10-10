import { describe, expect, it } from 'vitest';

import { spokenLength } from '@/caller/clips.js';

/** A clip: `voice` seconds at full level, then `room` seconds of tail 40 dB down. */
function clip(voice: number, room: number, sampleRate = 8000) {
  const data = new Float32Array(Math.round((voice + room) * sampleRate));
  data.forEach((_, i) => (data[i] = Math.sin(i / 3) * (i < voice * sampleRate ? 0.8 : 0.008)));
  return { sampleRate, length: data.length, getChannelData: () => data };
}

describe('where a clip\'s words end', () => {
  it('leaves the room dying away after the words out', () => {
    expect(spokenLength(clip(0.6, 0.5))).toBeCloseTo(0.6, 1);
  });

  it('is the whole clip when it has no tail', () => {
    expect(spokenLength(clip(0.4, 0))).toBeCloseTo(0.4, 2);
  });
});
