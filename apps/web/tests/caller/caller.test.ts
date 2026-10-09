import { describe, expect, it } from 'vitest';

import { ClipCaller, type Speech } from '@/caller/caller.js';
import type { Clips } from '@/caller/clips.js';

function setup(recorded: string[] | null) {
  const heard: string[] = [];
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
  };
  const speech: Speech = {
    available: true,
    say: async (text, kind) => void heard.push(`${kind}: ${text}`),
    cancel: () => undefined,
  };
  const voice = new ClipCaller(async () => clips, speech, true, async () => undefined);
  const settled = () => new Promise((done) => setTimeout(done, 0));
  const end = async () => {
    ending?.();
    await settled();
  };
  return { heard, voice, settled, end };
}

describe('the clip caller', () => {
  it('plays the words from clips and has the browser say only the names', async () => {
    const { heard, voice, end } = setup(['sixty', 'you require forty']);
    voice.sequence([['sixty'], [{ name: 'Ann' }, 'you require forty']]);
    await end();
    await end();
    expect(heard).toEqual(['clip: sixty', 'name: Ann', 'clip: you require forty']);
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
