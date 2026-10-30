/**
 * Finding the board in a photograph (core's boardFinder), from the app: the
 * photograph decoded to pixels and handed to a worker, its steps reported as
 * they start. Where there are no workers it runs here instead.
 */

import { findBoard, type BoardNotFound, type FinderStep, type FoundBoard, type Matrix3, type RgbaImage } from '@treblewise/core';

import type { FindRequest } from './findBoard.worker.js';

/** What finding the board came to: the board, or why not, including a photograph that would not decode. */
export type FinderResult = FoundBoard | { notFound: BoardNotFound | 'unreadable' };

export interface FindOptions {
  /** Snap from here instead of searching the picture (core `findBoard`'s `near`). */
  near?: Matrix3;
  onStep?: (step: FinderStep) => void;
}

/** A photograph's pixels, or null when it cannot be decoded. */
async function decode(jpeg: Blob): Promise<RgbaImage | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(jpeg);
    const { width, height } = bitmap;
    const canvas =
      typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
    const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data } = context.getImageData(0, 0, width, height);
    return { data, width, height };
  } catch {
    return null;
  }
}

function inWorker(request: FindRequest, onStep: (step: FinderStep) => void): Promise<FinderResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./findBoard.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ type: 'step'; step: FinderStep } | { type: 'done'; result: FinderResult }>) => {
      if (event.data.type === 'step') {
        onStep(event.data.step);
        return;
      }
      worker.terminate();
      resolve(event.data.result);
    };
    worker.onerror = (error) => {
      worker.terminate();
      reject(error);
    };
    worker.postMessage(request, [request.image.data.buffer]);
  });
}

export async function findBoardIn(jpeg: Blob, options: FindOptions = {}): Promise<FinderResult> {
  const onStep = options.onStep ?? (() => {});
  onStep('colours');
  const near = options.near ? { near: options.near } : {};
  if (typeof Worker === 'function') {
    const image = await decode(jpeg);
    if (!image) return { notFound: 'unreadable' };
    try {
      return await inWorker({ image, ...near }, onStep);
    } catch {
      // A worker that would not start (an old browser, a strict policy): do it
      // here, from a fresh decode, as the pixels went to the worker.
    }
  }
  const image = await decode(jpeg);
  if (!image) return { notFound: 'unreadable' };
  return findBoard(image, { ...near, onStep });
}
