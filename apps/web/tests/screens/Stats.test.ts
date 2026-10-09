import { hit, targetPoint, type Point } from '@treblewise/core';
import { screen, waitFor } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { deleteMatch, listMatches } from '@/storage/db.js';
import { useMatchesStore, usePlayersStore } from '@/store/stores.js';
import { renderAt } from '../support/renderAt.js';

const marco = { id: 'marco', name: 'Marco' };

const config = {
  startScore: 501,
  inRule: 'straight' as const,
  outRule: 'double' as const,
  legsPerSet: 1,
  setsToWin: 1,
  players: [marco],
};

const T20 = targetPoint(hit(20, 'treble'));

/** A deterministic thrower, so the numbers in the assertions are stable. */
function scatter(index: number, sigma: number): Point {
  const angle = (index * 2.399) % (Math.PI * 2);
  const radius = ((index * 37) % 100) / 100;
  return { x: T20.x + Math.cos(angle) * radius * sigma, y: T20.y + Math.sin(angle) * radius * sigma };
}

function throwDarts(count: number, sigma = 12) {
  const matches = useMatchesStore();
  matches.start(config);
  for (let index = 0; index < count; index += 1) {
    if (!matches.snapshot?.current) break;
    matches.throwDart(hit(20, 'treble'), { pos: scatter(index, sigma) });
  }
}

/** The page reads what is stored: the stores the tests wrote with are kept for it. */
const renderStats = () => renderAt('/stats', () => undefined, { keepStores: true });

describe('the statistics page', () => {
  beforeEach(async () => {
    // The page reads every match ever stored, so each test starts from nothing.
    for (const match of await listMatches(Number.MAX_SAFE_INTEGER)) await deleteMatch(match.id);
    setActivePinia(createPinia());
  });

  it('says so plainly when there is nothing to show', async () => {
    await renderStats();
    expect(await screen.findByText(/play a leg and this fills up/i)).toBeDefined();
  });

  /** What the engine actually recorded — busts make the count its own business. */
  function dartsRecorded(): number {
    const snapshot = useMatchesStore().snapshot!;
    return snapshot.legs.reduce((sum, leg) => sum + (leg.dartsThrown.marco ?? 0), 0);
  }

  it('shows the headline numbers once darts have been thrown', async () => {
    throwDarts(12);
    const thrown = dartsRecorded();
    await renderStats();

    await waitFor(() => expect(screen.getByText(/3-dart average/i)).toBeDefined());
    expect(screen.getByText(new RegExp(`from ${thrown} darts`, 'i'))).toBeDefined();
    expect(screen.getByText(/shape of your scoring/i)).toBeDefined();
    // Treble 20s only — busts pull it down, but it is still a scoring average.
    const average = Number(screen.getByText(/3-dart average/i).parentElement!.children[1]!.textContent);
    expect(average).toBeGreaterThan(60);
  });

  it('holds the aiming map back until there are enough darts to estimate a spread', async () => {
    throwDarts(12);
    const thrown = dartsRecorded();
    await renderStats();

    await waitFor(() => expect(screen.getByText(/where you should aim/i)).toBeDefined());
    expect(
      screen.getByText(new RegExp(`needs 50 darts with a position; there are ${thrown}`, 'i')),
    ).toBeDefined();
  });

  it('draws the heatmap and names the spread once positions exist', async () => {
    throwDarts(30);
    await renderStats();

    await waitFor(() => expect(screen.getByText(/where your darts land/i)).toBeDefined());
    expect(screen.getByLabelText(/heatmap of where the darts landed/i)).toBeDefined();
    expect(screen.getByText(/your group measures about/i)).toBeDefined();
    // The caveat about tapped positions is not buried in a help page.
    expect(screen.getByText(/tapped on the board rather than read by a camera/i)).toBeDefined();
  });

  it('keeps guests out of the player list', async () => {
    const matches = useMatchesStore();
    matches.start({ ...config, players: [marco, { id: 'guest-abc', name: 'Dave', temporary: true }] });
    matches.throwDart(hit(20, 'treble'), { pos: T20 });
    matches.throwDart(hit(20, 'treble'), { pos: T20 });
    matches.throwDart(hit(20, 'treble'), { pos: T20 });
    // Dave's turn.
    matches.throwDart(hit(5, 'single'));

    await renderStats();

    await waitFor(() => expect(screen.getByText(/3-dart average/i)).toBeDefined());
    expect(screen.queryByRole('radio', { name: 'Dave' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Marco' })).toBeDefined();
  });

  it('shows a renamed profile under its new name', async () => {
    const players = usePlayersStore();
    const profile = await players.createProfile('Marco');
    useMatchesStore().start({ ...config, players: [{ id: profile.id, name: 'Marco' }] });
    useMatchesStore().throwDart(hit(20, 'treble'), { pos: T20 });
    await players.renameProfile(profile.id, 'Marco G.');

    await renderStats();

    // The match stored "Marco"; the profile now says "Marco G." and wins.
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Marco G.' })).toBeDefined());
    expect(screen.queryByRole('radio', { name: 'Marco' })).toBeNull();
  });

  it('explains what its contested definitions mean, next to them', async () => {
    throwDarts(12);
    await renderStats();

    await waitFor(() => expect(screen.getByText(/checkout/i)).toBeDefined());
    const checkout = screen.getByTitle(/doubles hit ÷ darts thrown at a double/i);
    expect(checkout).toBeDefined();
  });
});
