import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const pwa = vi.hoisted(() => ({ applyUpdate: vi.fn(), updateReady: null as unknown as { value: boolean } }));
vi.mock('@/pwa/update.js', () => {
  pwa.updateReady = ref(false);
  return pwa;
});

import UpdatePrompt from '@/components/UpdatePrompt.vue';

describe('the update prompt', () => {
  it('says nothing until a new version is waiting, then lets the player choose when', async () => {
    render(UpdatePrompt);
    expect(screen.queryByText(/a new version is ready/i)).toBeNull();

    pwa.updateReady.value = true;
    expect(await screen.findByText(/a new version is ready/i)).toBeDefined();
    // Nothing happens by itself: only Reload moves to it.
    expect(pwa.applyUpdate).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    expect(pwa.applyUpdate).toHaveBeenCalledOnce();
  });

  it('goes away on Later, leaving the new version waiting', async () => {
    pwa.updateReady.value = true;
    render(UpdatePrompt);
    await fireEvent.click(screen.getByRole('button', { name: /later/i }));
    expect(screen.queryByText(/a new version is ready/i)).toBeNull();
  });
});
