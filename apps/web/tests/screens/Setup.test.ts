import { fireEvent, screen } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteMatch, deleteProfile, listMatches, listProfiles, putMatch, saveSetting } from '@/storage/db.js';
import { loadStores, useMatchesStore, usePlayersStore } from '@/store/stores.js';
import { renderAt } from '../support/renderAt.js';

const press = async (name: RegExp) => fireEvent.click(await screen.findByRole('button', { name }));

describe('starting a match', () => {
  beforeEach(async () => {
    for (const match of await listMatches(Number.MAX_SAFE_INTEGER)) await deleteMatch(match.id);
    for (const profile of await listProfiles()) await deleteProfile(profile.id);
    await saveSetting('profilesSeeded', true);
  });

  it('keeps a guest around for the rest of the session', async () => {
    const { router } = await renderAt('/setup');
    await press(/\+ guest/i);
    await fireEvent.update(screen.getByLabelText(/guest/i), 'Dave');
    await press(/add for this match/i);
    expect(screen.getByText('Dave')).toBeDefined();

    // Back at the setup screen after the leg: Dave is one tap away, not a name
    // to be typed again, and he is still not a profile.
    await router.push('/lobby');
    await router.push('/setup');
    await press(/\+ dave/i);
    expect(screen.getByText('Dave')).toBeDefined();
    expect(usePlayersStore().profiles).toEqual([]);

    await press(/start match/i);
    const players = useMatchesStore().snapshot!.config.players;
    expect(players.map((player) => player.name)).toEqual(['Dave']);
    expect(players[0]!.temporary).toBe(true);
    // Stored, not only shown: a guest kept as a Vue proxy made IndexedDB
    // refuse the whole match.
    const stored = await listMatches(Number.MAX_SAFE_INTEGER);
    expect(stored.map((match) => match.config.players.map((player) => player.name))).toEqual([['Dave']]);
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/game'));
  });

  it('lets a profile be renamed to a name with a space in it', async () => {
    await renderAt('/setup');
    await press(/new profile/i);
    await fireEvent.update(screen.getByLabelText(/new profile/i), 'Marco');
    await press(/^create$/i);
    await press(/manage profiles/i);

    const field = (await screen.findByLabelText(/^name marco$/i)) as HTMLInputElement;
    // Typed one character at a time: the trailing space must survive, or the
    // second word can never be started.
    for (const value of ['Marco ', 'Marco G', 'Marco G.']) {
      await fireEvent.update(field, value);
      expect(field.value).toBe(value);
    }
    await fireEvent.blur(field);

    await vi.waitFor(() => expect(usePlayersStore().profiles[0]!.name).toBe('Marco G.'));
    // The id is the one made at creation, so the history follows the rename.
    expect(usePlayersStore().profiles[0]!.id).toBe('marco');

    // And the match is started under the new name, not the one picked earlier.
    await press(/done/i);
    await press(/start match/i);
    expect(useMatchesStore().snapshot!.config.players[0]!.name).toBe('Marco G.');
  });

  it('chooses the start score and the rules as radio groups', async () => {
    await renderAt('/setup');
    const scores = screen.getByRole('radiogroup', { name: /start score/i });
    expect(screen.getByRole('radio', { name: '501' }).getAttribute('aria-checked')).toBe('true');
    // One tab stop for the row; the arrows move the choice.
    expect(screen.getByRole('radio', { name: '301' }).getAttribute('tabindex')).toBe('-1');
    await fireEvent.keyDown(screen.getByRole('radio', { name: '501' }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: '701' }).getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '701' }));
    expect(scores).toBeDefined();

    await press(/start match/i);
    expect(useMatchesStore().snapshot!.config.startScore).toBe(701);
  });

  it('finds the players of matches played before profiles existed', async () => {
    await putMatch({
      id: 'old-match',
      createdAt: 1000,
      updatedAt: 2000,
      finished: true,
      events: [],
      config: {
        startScore: 501,
        inRule: 'straight',
        outRule: 'double',
        legsPerSet: 1,
        setsToWin: 1,
        players: [
          { id: 'marco', name: 'Marco' },
          { id: 'guest-old', name: 'Dave', temporary: true },
        ],
      },
    });
    await saveSetting('profilesSeeded', false);

    await renderAt('/setup');
    await loadStores();

    // Marco gets his history back; the guest he played stays forgotten.
    expect(usePlayersStore().profiles.map((profile) => profile.id)).toEqual(['marco']);
    expect(usePlayersStore().profiles[0]!.lastPlayedAt).toBe(2000);

    // Once only: deleting the profile on purpose must not undo the deletion.
    await usePlayersStore().removeProfile('marco');
    await loadStores();
    expect(usePlayersStore().profiles).toEqual([]);
  });
});
