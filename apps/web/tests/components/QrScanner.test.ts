import { render } from '@testing-library/vue';
import { beforeEach, describe, expect, it } from 'vitest';

import QrScanner from '@/components/QrScanner.vue';

describe('the QR scanner', () => {
  beforeEach(() => {
    // No camera here: only how the preview is drawn is under test.
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new Error('no camera')) },
    });
  });

  it('shows a laptop’s front camera as a mirror, like a video call', () => {
    const { container } = render(QrScanner, { props: { facing: 'user' } });
    expect(container.querySelector('video')!.className).toContain('scanner-video-mirrored');
  });

  it('shows a phone’s back camera the right way round', () => {
    const { container } = render(QrScanner, { props: { facing: 'environment' } });
    expect(container.querySelector('video')!.className).not.toContain('scanner-video-mirrored');
  });

  it('says what went wrong when there is no camera', async () => {
    const { findByText } = render(QrScanner, { props: { facing: 'user' } });
    expect(await findByText(/no camera/i)).toBeDefined();
  });
});
