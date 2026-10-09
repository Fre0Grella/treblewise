/**
 * The two ends of pairing, with the radio taken out.
 *
 * A real handshake needs two peer connections, a camera and a network, and it
 * is checked in a browser rather than here. What these tests hold is the part
 * that can go quietly wrong without anybody noticing: that a computer with no
 * camera is offered the written code, that a whole code connects on its own,
 * and that the phone shows a code worth copying.
 */

import { fireEvent, screen, waitFor } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ANSWER } from '../../fixtures/handshake.js';
import { encodeShortCode, formatShortCode, readAnswer } from '@/pairing/shortcode.js';
import { useLobbyStore } from '@/store/stores.js';
import { renderAt } from '../../support/renderAt.js';

const accepted: string[] = [];
const fakeConnection = vi.hoisted(() => ({
  state: 'waiting',
  close: (() => undefined) as (() => void) & { mock?: unknown },
  accept: async (_code: string): Promise<void> => undefined,
  send: () => undefined,
  onStream: null as ((stream: MediaStream) => void) | null,
  onState: null as unknown,
}));

const shortCode = encodeShortCode(readAnswer(ANSWER));

vi.mock('@/pairing/session.js', () => ({
  PairingConnection: {
    host: async () => ({ connection: fakeConnection, code: 'oche1.h.z.ABC' }),
    // Called only once a test runs, by when the short code exists.
    join: async () => ({ connection: fakeConnection, code: 'oche1.c.z.DEF', shortCode }),
  },
}));

// The scanner owns a camera; here it is a button that produces a code.
vi.mock('@/components/QrScanner.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      emits: ['code'],
      setup(_, { emit }) {
        return () => h('button', { type: 'button', onClick: () => emit('code', 'oche1.c.z.DEF') }, 'pretend to scan');
      },
    }),
  };
});

vi.mock('@/vision/camera.js', () => ({
  startCamera: async () => ({ getVideoTracks: () => [{}], getTracks: () => [] }),
  stopCamera: () => undefined,
  keepAwake: async () => null,
  grabJpeg: async () => null,
}));

// jsdom has no media playback, and its play() returns undefined rather than a
// promise, which is not how any browser behaves.
HTMLMediaElement.prototype.play = async () => undefined;

const press = async (name: RegExp) => fireEvent.click(await screen.findByRole('button', { name }));

describe('the computer half of pairing', () => {
  beforeEach(() => {
    accepted.length = 0;
    fakeConnection.state = 'waiting';
    fakeConnection.close = vi.fn();
    fakeConnection.accept = vi.fn(async (code: string) => {
      accepted.push(code);
    });
  });

  it('offers both ways of reading the phone back', async () => {
    await renderAt('/pair/laptop');
    await press(/show the pairing code/i);
    await press(/now read the phone/i);

    expect(screen.getByRole('radio', { name: /read it with the webcam/i })).toBeDefined();
    expect(screen.getByRole('radio', { name: /paste the written code/i })).toBeDefined();
  });

  it('connects as soon as a whole written code is in the box, with no submit button', async () => {
    await renderAt('/pair/laptop');
    await press(/show the pairing code/i);
    await press(/now read the phone/i);
    await fireEvent.click(screen.getByRole('radio', { name: /paste the written code/i }));

    const box = screen.getByLabelText(/paste the written code/i, { selector: 'textarea' });

    // Half a code is not a code: nothing is tried, and nothing complains.
    await fireEvent.update(box, shortCode.slice(0, 40));
    expect(accepted).toEqual([]);

    // The whole thing, as a person would paste it: in groups, lower case.
    const asTyped = formatShortCode(shortCode).toLowerCase();
    await fireEvent.update(box, asTyped);
    await waitFor(() => expect(accepted).toEqual([asTyped]));
  });

  it('keeps the connection it has just handed to the lobby', async () => {
    const { router } = await renderAt('/pair/laptop');
    await press(/show the pairing code/i);

    // The phone's video arrives while the connection is still being set up:
    // a browser fires `track` on the answer, before `connected`.
    fakeConnection.state = 'connecting';
    fakeConnection.onStream!({} as MediaStream);

    // Opening the lobby takes this screen away. It used to close the
    // connection on its way out, because it was not `connected` yet, and the
    // lobby then said the phone had disconnected.
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/lobby'));
    expect(fakeConnection.close).not.toHaveBeenCalled();
    expect(useLobbyStore().pairing).toBe(fakeConnection);
  });

  it('still closes a handshake that was abandoned half way', async () => {
    const { router } = await renderAt('/pair/laptop');
    await press(/show the pairing code/i);
    await router.push('/');
    await vi.waitFor(() => expect(fakeConnection.close).toHaveBeenCalledOnce());
  });

  it('counts what has been typed so far', async () => {
    await renderAt('/pair/laptop');
    await press(/show the pairing code/i);
    await press(/now read the phone/i);
    await fireEvent.click(screen.getByRole('radio', { name: /paste the written code/i }));

    await fireEvent.update(screen.getByLabelText(/paste the written code/i, { selector: 'textarea' }), 'abcde fghij');
    expect(screen.getByText(/10 characters/)).toBeDefined();
  });

  it('goes back to the choice of device, not the front door, before it is paired', async () => {
    const { router } = await renderAt('/pair/laptop');
    await fireEvent.click(screen.getByRole('button', { name: /back/i }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/pair'));
  });
});

describe('the phone half of pairing', () => {
  it('shows a code to copy as well as one to photograph', async () => {
    await renderAt('/pair/phone');
    await press(/pretend to scan/i);

    await waitFor(() => expect(screen.getByText(/no camera on the computer/i)).toBeDefined());
    // Printed in groups, so it can be read off one screen and typed into
    // another. The line breaks are the point, so the text is compared as is.
    expect(document.querySelector('.pair-code')?.textContent).toBe(formatShortCode(shortCode));

    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await press(/copy the code/i);

    expect(writeText).toHaveBeenCalledWith(formatShortCode(shortCode));
    await waitFor(() => expect(screen.getByRole('button', { name: /copied/i })).toBeDefined());
  });
});

describe('which device is this', () => {
  it('sends the computer to show its code and the phone to film', async () => {
    const { router } = await renderAt('/pair');
    expect(screen.getByLabelText(/the computer end/i)).toBeDefined();
    expect(screen.getByLabelText(/the phone end/i)).toBeDefined();

    await press(/i'm on the phone/i);
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/pair/phone'));

    await router.push('/pair');
    await press(/i'm on the computer/i);
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/pair/laptop'));
    expect(useLobbyStore().mode).toBe('paired');
    expect(await screen.findByText(/no accounts, no internet/i)).toBeDefined();
  });
});
