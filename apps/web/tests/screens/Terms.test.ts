import { screen } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModelManifest } from '@/vision/detector.js';
import { renderAt } from '../support/renderAt.js';

const shipped = vi.hoisted(() => ({ manifest: null as ModelManifest | null }));
vi.mock('@/vision/detector.js', () => ({ loadManifest: async () => shipped.manifest, loadDetector: async () => null }));

describe('the terms', () => {
  beforeEach(() => {
    shipped.manifest = null;
  });

  it('say it is free, without warranty, and AGPL, with the source a click away', async () => {
    await renderAt('/terms');
    expect(screen.getByRole('heading', { name: /no warranty/i })).toBeDefined();
    expect(screen.getByText(/version 3 or later \(AGPL-3\.0\)/)).toBeDefined();
    expect(screen.getByRole('link', { name: /the source code/i }).getAttribute('href')).toBe('https://github.com/Fre0Grella/treblewise');
    expect(screen.getByRole('link', { name: /the licence/i }).getAttribute('href')).toBe('https://www.gnu.org/licenses/agpl-3.0.html');
  });

  it("name the datasets of the model the site ships, and dartscribe's share-alike", async () => {
    shipped.manifest = { name: 'tips-v4', file: 'tips-v4.onnx', sha256: 'x', deepdarts: true, dartscribe: true };
    await renderAt('/terms');
    expect(await screen.findByText(/the model this site ships, tips-v4/i)).toBeDefined();
    expect(screen.getByText(/deepdarts dataset/i)).toBeDefined();
    expect(screen.getByText(/dartscribe dataset/i)).toBeDefined();
    expect(screen.getByText(/treated as licensed under CC BY-SA 4\.0/i)).toBeDefined();
  });

  it('claim no datasets when no model ships', async () => {
    await renderAt('/terms');
    expect(screen.getByText(/whenever this site ships a model/i)).toBeDefined();
    expect(screen.queryByText(/dartscribe/i)).toBeNull();
  });
});
