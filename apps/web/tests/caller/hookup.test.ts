import { describe, expect, it, vi } from 'vitest';

import type { CallerVoice } from '@/caller/caller.js';
import { hookUpCaller } from '@/caller/hookup.js';

function fakeVoice(): CallerVoice & { sequence: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> } {
  return { available: true, say: vi.fn(), sequence: vi.fn(), cancel: vi.fn() };
}

describe('the caller hooked up to the match', () => {
  it('says what the match announced while the caller is on', () => {
    const voice = fakeVoice();
    let on = true;
    const hookup = hookUpCaller(() => on, () => voice);

    hookup.heard(['one hundred and eighty', 'Bob to throw']);
    expect(voice.sequence).toHaveBeenCalledWith(['one hundred and eighty', 'Bob to throw']);

    on = false;
    hookup.heard(['sixty']);
    expect(voice.sequence).toHaveBeenCalledTimes(1);
  });

  it('says nothing, and does not interrupt, when there is nothing to announce', () => {
    const voice = fakeVoice();
    hookUpCaller(() => true, () => voice).heard([]);
    expect(voice.sequence).not.toHaveBeenCalled();
  });

  it('falls silent when hushed, on or off', () => {
    const voice = fakeVoice();
    hookUpCaller(() => false, () => voice).hush();
    expect(voice.cancel).toHaveBeenCalled();
  });
});
