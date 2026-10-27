import { describe, expect, it } from 'vitest';

import { linkHealth, middle, steadyHealth } from '@/pairing/link.js';

describe('the connection light', () => {
  it('is green on a connection like the good sessions', () => {
    expect(linkHealth({ estimateKbps: 2500, rttMs: 6, photoMs: 180 })).toBe('good');
  });

  it('is red on photographs that take seconds, as in the bad session', () => {
    expect(linkHealth({ estimateKbps: 2500, rttMs: 6, photoMs: 4150 })).toBe('bad');
  });

  it('is red on a video squeezed into too few bits', () => {
    expect(linkHealth({ estimateKbps: 300 })).toBe('bad');
  });

  it('is amber in between', () => {
    expect(linkHealth({ estimateKbps: 1000 })).toBe('slow');
    expect(linkHealth({ photoMs: 900 })).toBe('slow');
    expect(linkHealth({ rttMs: 200 })).toBe('slow');
  });

  it('has nothing to say before anything is known', () => {
    expect(linkHealth({})).toBeNull();
    expect(linkHealth({ fps: 30 })).toBeNull();
  });
});

describe('a steady light', () => {
  it('shows the first judgement at once', () => {
    expect(steadyHealth(null, null, 'good')).toEqual({ shown: 'good', pending: null });
  });

  it('changes colour only once a new one is judged twice running', () => {
    const once = steadyHealth('good', null, 'bad');
    expect(once).toEqual({ shown: 'good', pending: 'bad' });
    expect(steadyHealth(once.shown, once.pending, 'bad')).toEqual({ shown: 'bad', pending: null });
  });

  it('forgets a one-off', () => {
    const once = steadyHealth('good', null, 'bad');
    expect(steadyHealth(once.shown, once.pending, 'good')).toEqual({ shown: 'good', pending: null });
  });
});

describe('middle', () => {
  it('is the middle of the values, whatever their order', () => {
    expect(middle([4000, 120, 150])).toBe(150);
    expect(middle([])).toBeUndefined();
  });
});
