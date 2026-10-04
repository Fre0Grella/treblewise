import { formatHit, formatRoute, type Hit, type Point } from '@treblewise/core';
import { useEffect, useState } from 'react';

import { Dartboard, type BoardDart } from '../components/Dartboard.js';
import { GameCamera } from '../components/GameCamera.js';
import { Keypad } from '../components/Keypad.js';
import { Scoreboard } from '../components/Scoreboard.js';
import { unlockCaller } from '../caller/caller.js';
import { playThud, playTurn, unlockSounds } from '../caller/sounds.js';
import { useGameVisit } from '../game/useGameVisit.js';
import { fill, useStrings } from '../i18n/index.js';
import { useMatchStore } from '../store/match.js';
import type { GrabbedFrame } from '../vision/camera.js';

export function Game() {
  const t = useStrings();
  const snapshot = useMatchStore((s) => s.snapshot);
  const match = useMatchStore((s) => s.match);
  const settings = useMatchStore((s) => s.settings);
  const throwDart = useMatchStore((s) => s.throwDart);
  const correctDart = useMatchStore((s) => s.correctDart);
  const undo = useMatchStore((s) => s.undo);
  const toggleCaller = useMatchStore((s) => s.toggleCaller);
  const toggleSounds = useMatchStore((s) => s.toggleSounds);
  const setEntryMode = useMatchStore((s) => s.setEntryMode);
  const setScreen = useMatchStore((s) => s.setScreen);
  const goHome = useMatchStore((s) => s.goHome);
  const session = useMatchStore((s) => s.session);

  /** id of the dart being corrected, if any. */
  const [correcting, setCorrecting] = useState<string | null>(null);
  /** The photograph the game visit's report is open on: the game decides when, the camera shows it. */
  const [reportOn, setReportOn] = useState<GrabbedFrame | null>(null);

  // Which visit's darts are in the board, and where it stands, is the game
  // visit's (game/gameVisit.ts); so is what the camera sees of it.
  const autoscoring = settings.keepFrames && settings.autoscoreGames;
  const { gameVisit, state: gameVisitState } = useGameVisit({
    snapshot,
    autoscoring,
    calibration: settings.calibration,
  });

  // The game visit says when the autoscorer entered a dart and when the turn
  // passes; the sounds are the game's.
  useEffect(
    () =>
      gameVisit.listen((signal) => {
        if (!useMatchStore.getState().settings.soundsEnabled) return;
        if (signal === 'dart-read') playThud();
        else playTurn();
      }),
    [gameVisit],
  );

  if (!snapshot) return null;

  const current = snapshot.current;
  const finished = snapshot.winnerId !== null;

  // The visit being thrown, or between visits the one just thrown, so its
  // darts stay on the board until the next player throws: a player walking
  // back from the board should still see where their darts landed.
  const { visit, position } = gameVisitState;
  const visitIsCurrent = position === 'throwing';
  // The visit just thrown, for as long as it is correctable here.
  const lastVisit = position === 'open' || position === 'held' ? visit : null;
  // Held, with the autoscorer scoring: the screen stays on the player who just
  // threw until the darts come out. The next player is not at the oche yet,
  // and the finished visit is the one anyone looks at to check it. The score
  // itself has moved on; only what is shown waits.
  const held = position === 'held';
  const nameOf = (id: string) => snapshot.config.players.find((p) => p.id === id)?.name ?? '';

  const canReport = settings.keepFrames && gameVisitState.reportable;
  const openReport = () => {
    if (canReport && !reportOn && gameVisitState.photo) setReportOn(gameVisitState.photo);
  };

  const dartChip = (dart: { id: string; hit: Hit; source: string }) => (
    <button
      key={dart.id}
      type="button"
      className={`dart-chip${correcting === dart.id ? ' dart-chip-correcting' : ''}${
        dart.source === 'auto' ? ' dart-chip-auto' : ''
      }`}
      onClick={() => setCorrecting((id) => (id === dart.id ? null : dart.id))}
      title={t.game.correctingHint}
    >
      {formatHit(dart.hit)}
    </button>
  );

  const visitDarts: BoardDart[] = (visit?.darts ?? []).map((dart) => ({
    id: dart.id,
    hit: dart.hit,
    ...(dart.pos ? { pos: dart.pos } : {}),
    past: !visitIsCurrent,
  }));

  const record = (hit: Hit, pos?: Point) => {
    unlockCaller();
    unlockSounds();
    if (correcting) {
      correctDart(correcting, hit, pos);
      setCorrecting(null);
      return;
    }
    if (settings.soundsEnabled) playThud();
    throwDart(hit, pos ? { pos } : {});
  };

  const winnerName =
    snapshot.config.players.find((p) => p.id === snapshot.winnerId)?.name ?? snapshot.winnerId ?? '';

  return (
    <div className="screen screen-game">
      <Scoreboard snapshot={snapshot} holding={held ? lastVisit!.playerId : null} />

      {held && lastVisit && current && (
        <div className="throw-strip throw-strip-held">
          <span className="throw-who">{fill(t.game.pullOut, { name: nameOf(lastVisit.playerId) })}</span>
          <span className="throw-darts">{lastVisit.darts.map(dartChip)}</span>
          {/* One row, always the same height: while a dart of this visit is
              being corrected, "Mark where they landed" takes its place beside
              "Darts out" instead of being searched for further down. */}
          <div className="held-actions">
            <button type="button" className="primary darts-out" onClick={() => gameVisit.dartsOut()}>
              {fill(t.game.dartsOut, { name: nameOf(current.playerId) })}
            </button>
            {correcting && canReport && lastVisit.darts.some((dart) => dart.id === correcting) && (
              <button
                type="button"
                className="chip held-mark"
                onClick={() => {
                  setCorrecting(null);
                  openReport();
                }}
              >
                {t.report.markVisit}
              </button>
            )}
          </div>
        </div>
      )}

      {current && !held && (
        <div className="throw-strip">
          <span className="throw-who">
            {snapshot.config.players.find((p) => p.id === current.playerId)?.name} {t.game.toThrow}
          </span>
          <span className="throw-darts">
            {(visitIsCurrent ? visit?.darts ?? [] : []).map(dartChip)}
            {Array.from({ length: visitIsCurrent ? Math.max(0, 3 - (visit?.darts.length ?? 0)) : 3 }).map((_, index) => (
              <span key={`empty-${index}`} className="dart-chip dart-chip-empty">
                ·
              </span>
            ))}
          </span>
        </div>
      )}

      {position === 'open' && lastVisit && (
        <div className="throw-strip throw-strip-last">
          <span className="throw-who">
            {fill(t.game.lastVisit, {
              name: snapshot.config.players.find((p) => p.id === lastVisit.playerId)?.name ?? '',
            })}
          </span>
          <span className="throw-darts">{lastVisit.darts.map(dartChip)}</span>
        </div>
      )}
      {correcting && <p className="hint">{t.game.correctingHint}</p>}

      <div className="entry">
        {settings.entryMode === 'board' ? (
          <Dartboard
            onHit={record}
            darts={visitDarts}
            target={held ? null : current?.checkout?.[visitIsCurrent ? visit?.darts.length ?? 0 : 0] ?? null}
            disabled={finished}
          />
        ) : (
          <Keypad onHit={(hit) => record(hit)} disabled={finished} />
        )}
      </div>

      {current?.checkout && !held && (
        <p className="checkout-line" title={t.game.chartNote}>
          {t.game.checkout}: <b>{formatRoute(current.checkout)}</b>
        </p>
      )}

      <div className="controls">
        <button type="button" className="chip" onClick={undo}>
          {t.game.undo}
        </button>
        <button
          type="button"
          className={`chip${settings.callerEnabled ? ' chip-on' : ''}`}
          onClick={toggleCaller}
        >
          {settings.callerEnabled ? t.game.callerOn : t.game.callerOff}
        </button>
        <button
          type="button"
          className={`chip${settings.soundsEnabled ? ' chip-on' : ''}`}
          onClick={() => {
            unlockSounds();
            toggleSounds();
          }}
        >
          {settings.soundsEnabled ? t.game.soundsOn : t.game.soundsOff}
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => setEntryMode(settings.entryMode === 'board' ? 'keypad' : 'board')}
        >
          {settings.entryMode === 'board' ? t.game.keypad : t.game.board}
        </button>
        <button type="button" className="chip" onClick={() => setScreen('stats')}>
          {t.stats.title}
        </button>
        <button type="button" className="chip" onClick={() => setScreen('setup')}>
          {t.game.newMatch}
        </button>
        {session && (
          <button type="button" className="chip" onClick={goHome}>
            {t.lobby.back}
          </button>
        )}
      </div>

      {settings.entryMode === 'board' && !finished && <p className="hint">{t.game.sourceNote}</p>}

      {match && (
        <GameCamera
          matchId={match.id}
          gameVisit={gameVisit}
          canThrow={current !== null && !finished}
          report={reportOn}
          onReport={openReport}
          onCloseReport={() => setReportOn(null)}
          onCorrect={(dartId, hit, pos) => correctDart(dartId, hit, pos)}
        />
      )}

      {finished && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>{fill(t.game.matchWon, { name: winnerName })}</h2>
            <button type="button" className="primary" onClick={() => setScreen('setup')}>
              {t.game.newMatch}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
