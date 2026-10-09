/**
 * Where Back goes, decided in one place rather than by each screen.
 *
 * During a lobby session every screen goes back to the lobby, so nobody pairs
 * twice by accident; without one, to the landing page. Camera setup opened
 * from a match goes back to the match: the screen that opens it says so with
 * `?from=game`, which also survives a reload.
 */

import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router';

import { useLobbyStore } from '../store/stores.js';
import { PATHS } from './paths.js';

/** The address Back leads to from `route`. */
export function backTarget(route: Pick<RouteLocationNormalizedLoaded, 'query'>, inSession: boolean): string {
  if (route.query.from === 'game') return PATHS.game;
  return inSession ? PATHS.lobby : PATHS.landing;
}

/** Goes back, by the rule above. */
export function useBack(): () => void {
  const router = useRouter();
  const route = useRoute();
  const lobby = useLobbyStore();
  return () => void router.push(backTarget(route, lobby.session !== null));
}
