/**
 * The board finder, off the main thread: half a second of pixel work that
 * would otherwise freeze the screen showing its progress.
 */

import { findBoard, type Matrix3, type RgbaImage } from '@treblewise/core';

export interface FindRequest {
  image: RgbaImage;
  near?: Matrix3;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<FindRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (event) => {
  const { image, near } = event.data;
  const result = findBoard(image, {
    ...(near ? { near } : {}),
    onStep: (step) => scope.postMessage({ type: 'step', step }),
  });
  scope.postMessage({ type: 'done', result });
};
