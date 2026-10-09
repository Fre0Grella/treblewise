/**
 * The camera as a composable: a stream, a video element to attach it to, and a
 * per-frame motion gate that calls back when the board has settled.
 *
 * Only one screen uses it at a time (the capture lab, or the game's camera
 * panel) because two of them would fight over the same camera.
 */

import { ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue';

import {
  grabJpeg,
  keepAwake,
  startCamera,
  stopCamera,
  thumbnail,
  THUMB_SIZE,
  type GrabbedFrame,
  type Region,
} from '../vision/camera.js';
import { assessImage, type ImageQuality } from '../vision/imageStats.js';
import { SettleDetector } from '../vision/settle.js';

/** How long after a photograph from the phone arrives the video is still watched for movement. */
const REMOTE_PHOTO_GUARD_MS = 250;

export interface CameraOptions {
  active: MaybeRefOrGetter<boolean>;
  deviceId?: MaybeRefOrGetter<string | undefined>;
  /**
   * Video from somewhere else: in paired mode, the phone's camera arriving
   * over WebRTC. When set, this watches that stream instead of opening a
   * camera of its own, and everything downstream is identical.
   */
  stream?: MaybeRefOrGetter<MediaStream | null>;
  /**
   * Where photographs come from, when not from the video on screen. In paired
   * mode that video is a compressed, downscaled copy, so the phone takes the
   * photograph itself (pairing/photo.ts). Sizes reported, and the region
   * given, are then those of the photograph, not of the video. If the first
   * photograph never arrives (an older phone build) the video is used after all.
   */
  grab?: MaybeRefOrGetter<(() => Promise<GrabbedFrame | null>) | null>;
  /**
   * Keep the camera on but stop watching it: no thumbnails, no settle
   * detection. For screens where a still photograph is on top and a person is
   * dragging markers, and every bit of the phone should go to their finger.
   */
  paused?: MaybeRefOrGetter<boolean>;
  /** Called once per throw, with the frame taken when the board went still and the thumbnail that showed it still. */
  onSettle?: (frame: GrabbedFrame, thumbnail: Uint8Array, before: Uint8Array | null) => void;
  /** Off: watch for motion without photographing anything. */
  captureOnSettle?: MaybeRefOrGetter<boolean>;
  /** The board's rectangle in the image. The capture trigger looks only inside it (see settle.ts). */
  region?: MaybeRefOrGetter<Region | null>;
  /** The board as it looked when it was calibrated, to notice the camera has been moved since. */
  reference?: MaybeRefOrGetter<Uint8Array | null>;
}

export function useCamera(options: CameraOptions) {
  const video = ref<HTMLVideoElement | null>(null);
  const ready = ref(false);
  const error = ref<string | null>(null);
  const width = ref(0);
  const height = ref(0);
  const moving = ref(false);
  /** Frames captured since the camera started, for the UI's counter. */
  const settles = ref(0);
  /** The two numbers the capture trigger works on, for tuning on a real board. */
  const motion = ref(0);
  const change = ref(0);
  /** The last photograph: how long from the settle to having it, and how many were dropped because the board changed meanwhile. */
  const photo = shallowRef<{ ms: number; dropped: number } | null>(null);
  /** Light, glare, sharpness and drift, for the setup coach. */
  const quality = shallowRef<ImageQuality | null>(null);

  const detector = new SettleDetector({ width: THUMB_SIZE, height: THUMB_SIZE });
  let capturing = false;
  let dropped = 0;
  /** The photograph's size when it is not the video's; null while it is. */
  let photoSize: { width: number; height: number } | null = null;

  const grab = () => toValue(options.grab) ?? null;
  const region = () => toValue(options.region) ?? null;

  /** A region in photograph pixels, in the video's pixels instead. */
  function toVideo(element: HTMLVideoElement, area: Region | null): Region | null {
    if (!area || !photoSize || element.videoWidth === 0) return area;
    const sx = element.videoWidth / photoSize.width;
    const sy = element.videoHeight / photoSize.height;
    return { x: area.x * sx, y: area.y * sy, width: area.width * sx, height: area.height * sy };
  }

  async function capture(): Promise<GrabbedFrame | null> {
    const element = video.value;
    if (!element) return null;
    const remote = grab();
    if (photoSize && remote) return remote();
    return grabJpeg(element);
  }

  /** The current board-region thumbnail, for storing as a calibration reference. */
  function sampleThumbnail(sampleRegion?: Region | null): Uint8Array | null {
    const element = video.value;
    if (!element) return null;
    return thumbnail(element, toVideo(element, sampleRegion === undefined ? region() : sampleRegion));
  }

  watch(
    () =>
      [
        toValue(options.active),
        toValue(options.deviceId),
        toValue(options.captureOnSettle) ?? true,
        toValue(options.stream) ?? null,
        video.value,
      ] as const,
    ([active, deviceId, captureOnSettle, external, element], _, onCleanup) => {
      if (!active || !element) return;

      let cancelled = false;
      let frame = 0;
      let lastReadoutAt = 0;
      let wakeLock: WakeLockSentinel | null = null;
      let own: MediaStream | null = null;

      const run = async () => {
        try {
          const stream = external ?? (await startCamera(deviceId));
          if (cancelled) {
            if (!external) stopCamera(stream);
            return;
          }
          // A stream we were handed belongs to whoever handed it over: it is
          // not ours to stop when the screen goes.
          own = external ? null : stream;

          element.srcObject = stream;
          element.playsInline = true;
          element.muted = true;
          await element.play().catch(() => undefined);

          // One photograph up front, to learn its size: calibration, the
          // overlay and the stale-calibration check all work in photograph pixels.
          photoSize = null;
          const remote = grab();
          const probe = remote ? await remote() : null;
          if (cancelled) return;
          if (probe) photoSize = { width: probe.width, height: probe.height };

          width.value = photoSize?.width ?? element.videoWidth;
          height.value = photoSize?.height ?? element.videoHeight;
          ready.value = true;
          error.value = null;
          detector.reset();
          // The phone holds its own wake lock in paired mode.
          if (!external) wakeLock = await keepAwake();

          const tick = () => {
            if (cancelled) return;
            frame = requestAnimationFrame(tick);

            // The received video changes size with the bandwidth; the
            // photograph does not, so only a local camera's size is tracked.
            if (!photoSize && element.videoWidth !== 0 && element.videoWidth !== width.value) {
              width.value = element.videoWidth;
              height.value = element.videoHeight;
            }

            if (toValue(options.paused)) return;

            const thumb = thumbnail(element, toVideo(element, region()));
            if (!thumb) return;

            const now = performance.now();
            const state = detector.push(thumb, now);
            moving.value = state === 'moving';

            // Two numbers a few times a second, not sixty: the readout is for
            // tuning, and redrawing it every frame would cost more than the detector.
            if (now - lastReadoutAt > 250) {
              lastReadoutAt = now;
              motion.value = detector.motion;
              change.value = detector.change;
              quality.value = assessImage(thumb, THUMB_SIZE, THUMB_SIZE, toValue(options.reference) ?? null);
            }

            if (state === 'settled' && captureOnSettle && !capturing) {
              capturing = true;
              const remoteGrab = photoSize !== null ? grab() : null;
              const before = detector.previousReference;
              const photograph = remoteGrab ? remoteGrab() : grabJpeg(element);
              void photograph
                .then(async (grabbed) => {
                  const took = Math.round(performance.now() - now);
                  // A frame of the video on screen is the still frame the settle
                  // saw. A photograph from the phone is taken some time later,
                  // after a round trip, and the next dart can be in the air by
                  // then. The video showing that moment arrives a little after
                  // the photograph, hence the wait before looking.
                  if (grabbed && remoteGrab) {
                    await new Promise((resolve) => setTimeout(resolve, REMOTE_PHOTO_GUARD_MS));
                    if (detector.changedSince(thumb)) {
                      detector.rewind();
                      dropped += 1;
                      photo.value = { ms: took, dropped };
                      console.info(`[treblewise] photo dropped: the board changed while it was taken (${took} ms)`);
                      return;
                    }
                  }
                  photo.value = { ms: took, dropped };
                  if (grabbed && !cancelled) {
                    settles.value += 1;
                    options.onSettle?.(grabbed, thumb, before);
                  }
                })
                .finally(() => {
                  capturing = false;
                });
            }
          };

          frame = requestAnimationFrame(tick);
        } catch (cause) {
          if (!cancelled) {
            error.value = cause instanceof Error ? cause.message : String(cause);
            ready.value = false;
          }
        }
      };

      void run();

      onCleanup(() => {
        cancelled = true;
        cancelAnimationFrame(frame);
        stopCamera(own);
        void wakeLock?.release().catch(() => undefined);
        ready.value = false;
        moving.value = false;
      });
    },
    { immediate: true },
  );

  return { video, ready, error, width, height, moving, settles, motion, change, photo, quality, capture, sampleThumbnail };
}

export type Camera = ReturnType<typeof useCamera>;
