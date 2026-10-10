/**
 * The game visit: which visit's darts are in the board during a game, and
 * where that visit stands (see CONTEXT.md).
 *
 * It used to be spread over two components. The game screen worked out from
 * the match which visit was being thrown and which was left open or held, and
 * remembered which one had its darts out; the camera kept the board watcher
 * told from props, and passed what the watcher saw back up as callbacks for
 * the game screen to act on. Here it is one piece of plain state, with no
 * framework: it follows the match snapshot, keeps the board watcher told
 * (which darts are in the board, the visit photo, when a visit is over, when
 * its darts are out), hands it each settle, and turns what the watcher sees
 * into the game's own actions: a dart the autoscorer read, a visit pulled out
 * early, the turn passing.
 *
 * Open, held and closed are never written to the match's event log, which
 * stays darts and corrections (docs/02). They live here, in memory, so a
 * reload shows the last visit open again.
 */

import { MISS, type Hit, type MatchSnapshot, type Visit } from '@treblewise/core';

import type { Calibration } from '../storage/types.js';
import type { ThrowOptions } from '../store/matches.js';
import type { BoardDart, BoardWatcher, BoardWatcherState } from '../vision/boardWatcher.js';
import type { GrabbedFrame } from '../vision/camera.js';

/**
 * Where the game visit stands. `throwing`: its darts are still being thrown.
 * `open`: thrown in full with the autoscorer not scoring, still shown and
 * correctable. `held`: thrown in full with the autoscorer scoring, and the
 * scoreboard waits on the player who threw. `closed`: its darts are out.
 */
export type VisitPosition = 'throwing' | 'open' | 'held' | 'closed';

/**
 * What the game screen hears from the game visit, for the sounds it plays.
 * `dart-read`: the autoscorer entered a dart. `dart-bust`: it entered one
 * that bust the visit. `turn-passed`: the next player is up, after a visit
 * ends, or with the autoscorer scoring once its darts are out.
 */
export type GameVisitSignal = 'dart-read' | 'dart-bust' | 'turn-passed';

export interface GameVisitState {
  /**
   * The visit whose darts are in the board: the one being thrown, or between
   * visits the one just thrown, so a player walking back from the board still
   * sees where their darts landed. Null without a match.
   */
  visit: Visit | null;
  position: VisitPosition;
  /** A report can be opened on it: it has darts, and the latest photograph fits the calibration. */
  reportable: boolean;
  /** The board watcher's pull-out phase: nothing is read until the darts are out. */
  pullingOut: boolean;
  /** The board watcher is reading a photograph. */
  reading: boolean;
  /** The model the site ships, and whether it is in use (the board watcher's). */
  model: BoardWatcherState['model'];
  /**
   * The photograph a report on it opens on: the visit photo, not the newest,
   * which by the time someone reports a dart is often a hand pulling the darts
   * out. The newest only when the visit photo does not fit the calibration.
   */
  photo: GrabbedFrame | null;
}

/** What the game visit reaches outside itself for: the match store's actions, fakes in tests. */
export interface GameVisitDeps {
  /** Enters a dart; says whether it bust the visit, when it knows. */
  throwDart: (hit: Hit, options: ThrowOptions) => { busted: boolean } | null | void;
}

export interface GameVisit {
  /** The match as it is now. Call it whenever the snapshot changes. */
  follow(snapshot: MatchSnapshot | null): void;
  /** Whether the autoscorer is scoring: the camera on, and "autoscorer scores" with it. */
  setAutoscoring(on: boolean): void;
  /** The calibration photographs are judged and reported under; the board watcher is told it too. */
  setCalibration(calibration: Calibration | null): void;
  /**
   * A settled photograph. It is the newest photograph either way; with the
   * autoscorer scoring, the watcher judges it, and what it shows may end the
   * pull-out phase, end the visit early, or be read for a new dart.
   */
  settle(photo: GrabbedFrame, thumbnail: Uint8Array | undefined, before: Uint8Array | null | undefined): void;
  /** A photograph taken because a dart was entered by hand: the visit photo is now this one. */
  photographed(photo: GrabbedFrame): void;
  /** "Darts out" pressed: the visit just thrown is closed, and the turn passes. */
  dartsOut(): void;
  /** Finds out which model the site ships, without loading it. */
  findModel(): Promise<void>;
  /** Switches the autoscorer's model on or off; it is loaded the first time. */
  switchModel(on: boolean): Promise<void>;
  state(): GameVisitState;
  subscribe(listener: () => void): () => void;
  /** Hears each signal as it happens. */
  listen(listener: (signal: GameVisitSignal) => void): () => void;
}

const fits = (photo: GrabbedFrame | null, calibration: Calibration | null): photo is GrabbedFrame =>
  photo !== null && calibration !== null && photo.width === calibration.width && photo.height === calibration.height;

export function createGameVisit(watcher: BoardWatcher, deps: GameVisitDeps): GameVisit {
  let snapshot: MatchSnapshot | null = null;
  let autoscoring = false;
  let calibration: Calibration | null = null;
  /** The finished visit whose darts are out (its first dart's id): no longer correctable here. */
  let closed: string | null = null;

  /** The newest photograph, settled or taken. */
  let latest: GrabbedFrame | null = null;
  /**
   * The photograph taken when the visit's latest dart went in: a report opens
   * on it, not on the newest, which by the time someone reports a dart is
   * often a hand pulling the darts out.
   */
  let visitPhoto: GrabbedFrame | null = null;
  /**
   * What the change gate compares a new photograph with: the settle before it,
   * whatever it showed, or the photograph read just before it. This is how the
   * game played when it was tried on a real board, and it stays that way: the
   * capture lab compares with its last saved photograph instead, which was
   * never put to the test in a game.
   */
  let gatePhoto: GrabbedFrame | null = null;
  const compareWith = (photo: GrabbedFrame) => {
    gatePhoto = photo;
    watcher.setVisitPhoto(photo);
  };
  /** The visit the visit photo was last taken for, to tell when a dart went in. */
  let photographedFor: { first: string | undefined; count: number } = { first: undefined, count: 0 };

  /**
   * Whether the visit was closed at the last sync, so "darts out" is said only
   * when it closes: a win ends a visit without its darts coming out, so the
   * pull-out phase it starts is never ended by "darts out", only by the board
   * or the next dart.
   */
  let shut = true;
  /** How many visits were finished at the last snapshot; undefined before the first. */
  let visitsDone: number | undefined;

  let current: GameVisitState = {
    visit: null,
    position: 'closed',
    reportable: false,
    pullingOut: false,
    reading: false,
    model: watcher.state().model,
    photo: null,
  };
  const listeners = new Set<() => void>();
  const signals = new Set<(signal: GameVisitSignal) => void>();
  const signal = (what: GameVisitSignal) => signals.forEach((listener) => listener(what));

  const visitOf = (match: MatchSnapshot | null): Visit | null => match?.legs.at(-1)?.visits.at(-1) ?? null;
  const canThrow = () => snapshot !== null && snapshot.current !== null && snapshot.winnerId === null;

  function positionOf(visit: Visit | null): VisitPosition {
    if (!snapshot || !visit) return 'closed';
    if (snapshot.current !== null && visit.playerId === snapshot.current.playerId && !visit.complete) return 'throwing';
    // The visit just thrown stays correctable until its darts come out (seen
    // by the camera, or "Darts out") or the next player throws: the third
    // dart used to vanish the moment it went in, wrong or not.
    const key = visit.darts[0]?.id;
    if (!visit.complete || key === undefined || key === closed || snapshot.winnerId !== null) return 'closed';
    // With the autoscorer scoring, the screen stays on the player who just
    // threw until the darts come out: the next player is not at the oche yet.
    return autoscoring ? 'held' : 'open';
  }

  /** The id of the finished visit's first dart, if the game visit is a finished visit. */
  const finishedKey = (visit: Visit | null) => (visit?.complete ? (visit.darts[0]?.id ?? null) : null);

  function publish() {
    const visit = visitOf(snapshot);
    const photo = fits(visitPhoto, calibration) ? visitPhoto : latest;
    const watching = watcher.state();
    const next: GameVisitState = {
      visit,
      position: positionOf(visit),
      reportable: visit !== null && visit.darts.length > 0 && fits(latest, calibration),
      pullingOut: watching.pullingOut,
      reading: watching.reading,
      model: watching.model,
      photo,
    };
    if (
      next.visit === current.visit &&
      next.position === current.position &&
      next.reportable === current.reportable &&
      next.pullingOut === current.pullingOut &&
      next.reading === current.reading &&
      next.model === current.model &&
      next.photo === current.photo
    ) {
      return;
    }
    current = next;
    listeners.forEach((listener) => listener());
  }

  /** Tells the watcher what the match and the closed visit now say, then publishes. */
  function sync() {
    const visit = visitOf(snapshot);
    const darts = visit?.darts ?? [];
    const position = positionOf(visit);

    // A dart went in: the newest photograph is the one with it. A dart entered
    // by hand may not have changed the picture enough to settle; the camera
    // photographs it, and `photographed` replaces this.
    const first = darts[0]?.id;
    if (first !== photographedFor.first || darts.length > photographedFor.count) visitPhoto = latest;
    photographedFor = { first, count: darts.length };

    // The darts in the board are the visit's while it is being thrown. Once it
    // is over they are still there, but nothing is read beside them: the
    // pull-out phase comes first.
    watcher.holds((position === 'throwing' ? darts : []).map((dart): BoardDart => (dart.pos ? { board: dart.pos } : {})));

    // A finished visit leaves its darts in the board until someone pulls them,
    // unless they were seen coming out before it ended; a dart of the next
    // visit means they are out, which the watcher sees in the darts it holds.
    if (visit !== null && visit.complete && darts.length > 0 && position !== 'throwing') watcher.visitOver();
    const nowShut = position !== 'open' && position !== 'held';
    if (nowShut && !shut) watcher.dartsOut();
    shut = nowShut;
    // The darts coming out does not change what the next photograph is
    // compared with: the settle before it.
    watcher.setVisitPhoto(gatePhoto);

    publish();
  }

  /** The darts of the visit just thrown are out: it is closed, and the next player is up. */
  function turnPassed() {
    closed = finishedKey(visitOf(snapshot));
    sync();
    signal('turn-passed');
  }

  // What the watcher shows (its pull-out phase, a reading, the model) is part
  // of the game visit's state: the camera talks to the game visit alone.
  watcher.subscribe(publish);

  async function read(photo: GrabbedFrame) {
    // Read, it becomes what the next one is compared with: before a photograph
    // that waited behind it is read.
    const reading = await watcher.read(photo, { afterRead: () => compareWith(photo) });
    if (reading.kind !== 'proposal') return;
    // A reading takes a while. A dart entered by hand meanwhile makes it stale
    // (the watcher says so); the autoscorer switched off, or the match won, is
    // checked here.
    if (!autoscoring || !canThrow()) return;
    const thrown = deps.throwDart(reading.dart.hit, {
      pos: reading.dart.board,
      source: 'auto',
      confidence: reading.dart.confidence,
      call: true,
    });
    signal(thrown?.busted ? 'dart-bust' : 'dart-read');
  }

  return {
    follow(next) {
      snapshot = next;
      sync();
      // The turn passing is a sound. With the autoscorer scoring, it sounds
      // when the darts come out; otherwise when a visit ends.
      const done = next?.legs.reduce((n, leg) => n + leg.visits.filter((visit) => visit.complete).length, 0) ?? 0;
      const more = visitsDone !== undefined && done > visitsDone;
      visitsDone = done;
      if (more && !autoscoring && next?.winnerId === null) signal('turn-passed');
    },

    setAutoscoring(on) {
      autoscoring = on;
      sync();
    },

    setCalibration(next) {
      calibration = next;
      watcher.setCalibration(next);
      publish();
    },

    settle(photo, thumbnail, before) {
      latest = photo;
      publish();
      if (!autoscoring || watcher.state().model.status !== 'ready' || !canThrow()) {
        compareWith(photo);
        return;
      }

      const seen = watcher.settle(photo, thumbnail, before);
      // Not read: the next photograph is compared with this one. One that is
      // read becomes it once read (see `read`).
      if (seen.kind !== 'throw') compareWith(photo);
      if (seen.kind === 'emptied') {
        turnPassed();
      } else if (seen.kind === 'early-pull') {
        // Pulled out with darts still to throw: the rest missed the board. Its
        // darts are out, so the visit is not left open for correcting. The
        // watcher is not told again until the misses are in the snapshot:
        // holding the darts again before then would take the early pull back.
        closed = visitOf(snapshot)?.darts[0]?.id ?? null;
        for (let n = 0; n < seen.missed; n += 1) deps.throwDart(MISS, { source: 'auto' });
        signal('turn-passed');
      } else if (seen.kind === 'throw') {
        void read(photo);
      }
    },

    photographed(photo) {
      latest = photo;
      visitPhoto = photo;
      publish();
    },

    dartsOut: turnPassed,

    findModel: () => watcher.findModel(),
    switchModel: (on) => watcher.switchModel(on),

    state: () => current,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    listen(listener) {
      signals.add(listener);
      return () => signals.delete(listener);
    },
  };
}
