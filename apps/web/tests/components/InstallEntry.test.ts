import { render, screen } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const pwa = vi.hoisted(() => ({
  canInstall: null as unknown as { value: boolean },
  installed: null as unknown as { value: boolean },
  ios: false,
  install: vi.fn(),
}));
vi.mock('@/pwa/install.js', () => {
  pwa.canInstall = ref(false);
  pwa.installed = ref(false);
  return { canInstall: pwa.canInstall, installed: pwa.installed, install: pwa.install, onIos: () => pwa.ios };
});

import InstallEntry from '@/components/InstallEntry.vue';

describe('the install entry', () => {
  it('offers to install where the browser does', () => {
    pwa.canInstall.value = true;
    pwa.installed.value = false;
    render(InstallEntry);
    expect(screen.getByRole('button', { name: /install app/i })).toBeDefined();
  });

  it('says how on an iPhone, which has no install button', () => {
    pwa.canInstall.value = false;
    pwa.ios = true;
    render(InstallEntry);
    expect(screen.getByText(/share, then add to home screen/i)).toBeDefined();
  });

  it('shows nothing inside the installed app', () => {
    pwa.canInstall.value = true;
    pwa.installed.value = true;
    pwa.ios = true;
    const { container } = render(InstallEntry);
    expect(container.textContent).toBe('');
  });
});
