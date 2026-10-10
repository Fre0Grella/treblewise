import { describe, expect, it } from 'vitest';

import { ClipCaller, nameSeconds, type Speech } from '@/caller/caller.js';
import type { Clips } from '@/caller/clips.js';

/** `logWaits`: the pauses go in what is heard, in order, as `wait <ms>`. */
function setup(recorded: string[] | null, logWaits = false) {
  const heard: string[] = [];
  const prepared: string[] = [];
  // A clip plays until it is stopped, or until the test lets it end.
  let ending: (() => void) | null = null;
  const clips: Clips | null = recorded && {
    play: (phrase) => {
      if (!recorded.includes(phrase)) return Promise.resolve(false);
      heard.push(`clip: ${phrase}`);
      return new Promise((done) => (ending = () => done(true)));
    },
    stop: () => {
      heard.push('stop');
      ending?.();
    },
    prepare: (phrase) => void prepared.push(phrase),
  };
  const speech: Speech = {
    available: true,
    say: async (text, kind) => void heard.push(`${kind}: ${text}`),
    cancel: () => undefined,
  };
  const voice = new ClipCaller(async () => clips, speech, true, async (ms) => void (logWaits && heard.push(`wait ${ms}`)));
  const settled = () => new Promise((done) => setTimeout(done, 0));
  const end = async () => {
    ending?.();
    await settled();
  };
  return { heard, prepared, voice, settled, end };
}

describe('the clip caller', () => {
  it('plays the words from clips and has the browser say only the names', async () => {
    const { heard, voice, end } = setup(['sixty', 'you require forty']);
    voice.sequence([['sixty'], [{ name: 'Ann' }, 'you require forty']]);
    await end();
    await end();
    expect(heard).toEqual(['clip: sixty', 'name: Ann', 'clip: you require forty']);
  });

  it('holds the words back for a pause, without a breath added to it', async () => {
    const { heard, voice, end } = setup(['no score'], true);
    voice.say([{ pause: 250 }, 'no score']);
    await end();
    expect(heard).toEqual(['wait 250', 'clip: no score']);
  });

  it('keeps the pause before the words when there are no clips', async () => {
    const { heard, voice, settled } = setup(null, true);
    voice.say([{ pause: 250 }, 'No score']);
    await settled();
    expect(heard).toEqual(['wait 250', 'words: No score']);
  });

  it('gets the words of a call ready before saying the name in front of them', async () => {
    const { heard, prepared, voice, settled } = setup(['you require forty']);
    voice.say([{ name: 'Ann' }, 'you require forty']);
    await settled();
    expect(prepared).toEqual(['you require forty']);
    expect(heard[0]).toBe('name: Ann');
  });

  it('says a phrase without a clip through the browser, as words', async () => {
    const { heard, voice, settled } = setup([]);
    voice.say(['Game shot!']);
    await settled();
    expect(heard).toEqual(['words: Game shot!']);
  });

  it('says whole calls through the browser while there are no clips', async () => {
    const { heard, voice, settled } = setup(null);
    voice.sequence([['sixty'], [{ name: 'Ann' }, 'you require forty']]);
    await settled();
    expect(heard).toEqual(['words: sixty', 'words: Ann, you require forty']);
  });

  it('stops at once when cancelled, and a new call replaces the old one', async () => {
    const { heard, voice, settled } = setup(['sixty', 'twenty', 'you require forty']);
    voice.sequence([['sixty'], [{ name: 'Ann' }, 'you require forty']]);
    await settled();
    voice.say(['twenty']);
    await settled();
    expect(heard).toEqual(['clip: sixty', 'stop', 'clip: twenty']);

    voice.cancel();
    await settled();
    expect(heard.slice(3)).toEqual(['stop']);
  });
});

describe('how long a name takes to say', () => {
  it('covers the Windows voices, which end their speech with a long silence', () => {
    // Measured end of the speech, before that silence.
    for (const [name, seconds] of [['Ann', 0.48], ['Sofi', 0.7], ['Alessandra', 0.92], ['Maximiliano Rossi', 1.52]] as const) {
      expect(nameSeconds(name)).toBeGreaterThanOrEqual(seconds);
      expect(nameSeconds(name)).toBeLessThan(seconds + 0.35);
    }
  });
});
