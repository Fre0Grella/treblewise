/**
 * Camera setup, and the practice round that proves it works.
 *
 * Three steps, once: point the camera, find the board, then **try it**. Try-it
 * is the heart of this screen. You throw a dart, the app photographs the board
 * the moment it settles, you tap the dart in the picture, and it calls the
 * score back at you. That single loop does three jobs at once:
 *
 *  - it shows you whether the camera is set up properly, because a wrong
 *    calibration gives a wrong score and you will hear it;
 *  - it is the least tedious way anyone has found to label training data, since
 *    a dart you have just thrown is a dart you can still see; and
 *  - one throw is one labelled sample, so the count going up is the training
 *    set being built.
 *
 * An earlier version photographed everything and queued it for labelling later.
 * A queue of forty near-identical photographs of a board is a chore nobody
 * finishes, and it was not obvious what it was for. Nothing is stored now
 * unless it has been marked.
 *
 * The darts are not pulled between throws, because a model has to learn the
 * second and third dart of a visit with the first ones in the way. So each
 * photograph opens with the darts already in the board marked where they were,
 * only the new one is left to tap, and nothing is ever saved except by
 * pressing Save: a frame with a visible dart unmarked, or a model's guess
 * nobody checked, would teach the model something wrong. A settle — any moment
 * the board goes still — never saves; a newer photograph waits behind one that
 * is being marked. That loop is the marking session (`capture/markingSession.ts`);
 * this screen sets up the camera, calibrates, and renders the session.
 */

import {
  CALIBRATION_BOARD_POINTS,
  assessBoardView,
  boardRegion,
  formatHit,
  type Point,
} from '@treblewise/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BoardOverlay, type OverlayHandle } from '../components/BoardOverlay.js';
import { Fold } from '../components/Fold.js';
import { PhoneBattery } from '../components/PhoneBattery.js';
import { SetupCoach } from '../components/SetupCoach.js';
import type { Exit } from '../capture/markingSession.js';
import { useMarkingSession } from '../capture/useMarkingSession.js';
import { unlockCaller } from '../caller/caller.js';
import { fill, useStrings } from '../i18n/index.js';
import { calibrate, countFrames, deleteFrame, exportFrames, listFrames } from '../storage/frames.js';
import { storageEstimate } from '../storage/db.js';
import { useMatchStore } from '../store/match.js';
import { cameraSupported, type GrabbedFrame } from '../vision/camera.js';
import { cropFrameStyle, squareAround } from '../vision/crop.js';
import { useCamera } from '../vision/useCamera.js';

type Mode = 'setup' | 'calibrate' | 'try';

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Four sensible starting positions, spread over the middle of the frame. */
function defaultHandles(width: number, height: number): Point[] {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.34;
  return [
    { x: cx, y: cy - r },
    { x: cx + r, y: cy },
    { x: cx, y: cy + r },
    { x: cx - r, y: cy },
  ];
}

export function Capture() {
  const t = useStrings();
  const goHome = useMatchStore((s) => s.goHome);
  const cameraReturn = useMatchStore((s) => s.cameraReturn);
  const setScreen = useMatchStore((s) => s.setScreen);
  const calibration = useMatchStore((s) => s.settings.calibration);
  const saveCalibration = useMatchStore((s) => s.saveCalibration);
  const callerEnabled = useMatchStore((s) => s.settings.callerEnabled);
  const playMode = useMatchStore((s) => s.mode);
  const remoteStream = useMatchStore((s) => s.remoteStream);
  const pairing = useMatchStore((s) => s.pairing);

  const [cameraOn, setCameraOn] = useState(false);
  const [mode, setMode] = useState<Mode>('setup');
  const [draft, setDraft] = useState<Point[]>([]);
  const [frozen, setFrozen] = useState<{ url: string; width: number; height: number } | null>(null);

  /**
   * Try-it: the photograph being marked, the one waiting behind it, the darts
   * in the board, saving, undo and the leave prompt (capture/markingSession.ts).
   * The session drives the board watcher; this screen only hands it settles
   * and taps, and renders what it says.
   */
  const { session, state: marking } = useMarkingSession();
  const { photo, inBoard, pullingOut } = marking;
  /** The model the site ships, known from its manifest; the model itself loads only when asked for. */
  const modelInfo = marking.model.manifest;
  // Off until a model has been tested on this board (issue #5): a proposal
  // from one that has not marks flights as often as tips.
  const [proposing, setProposing] = useState(false);

  const [stats, setStats] = useState({ total: 0, labelled: 0, bytes: 0 });
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const paired = playMode === 'paired' && remoteStream !== null;

  const refreshStats = useCallback(async () => {
    setStats(await countFrames());
    setUsage(await storageEstimate());
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  /** A settled photograph goes to the marking session, in try-it only. Nothing is ever saved here (issue #3). */
  const onSettle = useCallback(
    (grabbed: GrabbedFrame, thumbnail?: Uint8Array, before?: Uint8Array | null) => {
      if (modeRef.current === 'try') session.settle(grabbed, thumbnail, before);
    },
    [session],
  );

  const region = useMemo(
    () =>
      calibration && calibration.width > 0
        ? boardRegion(calibration.toImage, { width: calibration.width, height: calibration.height })
        : null,
    [calibration],
  );

  const reference = useMemo(
    () => (calibration?.reference ? Uint8Array.from(calibration.reference) : null),
    [calibration],
  );

  const camera = useCamera({
    active: cameraOn || paired,
    onSettle,
    captureOnSettle: mode === 'try' && calibration !== null,
    region,
    reference,
    stream: paired ? remoteStream : null,
    grab: paired && pairing ? () => pairing.requestPhoto() : null,
    // Aligning the board is done on a still photograph: nothing to watch for.
    paused: mode === 'calibrate',
  });

  const frameSize =
    photo && mode === 'try'
      ? { width: photo.grabbed.width, height: photo.grabbed.height }
      : mode === 'calibrate' && frozen
        ? { width: frozen.width, height: frozen.height }
        : { width: camera.width || 1280, height: camera.height || 720 };

  const staleCalibration =
    calibration !== null &&
    camera.width > 0 &&
    (calibration.width !== camera.width || calibration.height !== camera.height);

  // Marking darts needs the board, not the wall around it: once calibrated,
  // only the square around the board is shown. Calibrating needs the lot.
  const crop =
    mode === 'try' && region && !staleCalibration && calibration?.width === frameSize.width
      ? squareAround(region, frameSize)
      : null;

  // ---- calibration -------------------------------------------------------

  const draftCalibration =
    mode === 'calibrate' && draft.length === 4
      ? calibrate(draft, CALIBRATION_BOARD_POINTS, frameSize)
      : null;

  const [draftTick, setDraftTick] = useState(0);
  const draftCalibrationRef = useRef(draftCalibration);
  draftCalibrationRef.current = draftCalibration;

  useEffect(() => {
    if (mode !== 'calibrate') return;
    const timer = setInterval(() => setDraftTick((tick) => tick + 1), 300);
    return () => clearInterval(timer);
  }, [mode]);

  const view = useMemo(() => {
    const source = mode === 'calibrate' ? draftCalibrationRef.current : calibration;
    if (!source) return null;
    return assessBoardView(source.toImage, { width: source.width, height: source.height });
  }, [calibration, mode, draftTick]);

  const startCalibration = async () => {
    const grabbed = await camera.capture();
    if (!grabbed) return;
    if (frozen) URL.revokeObjectURL(frozen.url);
    setFrozen({ url: URL.createObjectURL(grabbed.jpeg), width: grabbed.width, height: grabbed.height });
    setDraft(
      calibration && !staleCalibration ? calibration.imagePoints : defaultHandles(grabbed.width, grabbed.height),
    );
    setMode('calibrate');
  };

  const finishCalibration = (save: boolean) => {
    if (save && draftCalibration) {
      const boardRect = boardRegion(draftCalibration.toImage, {
        width: draftCalibration.width,
        height: draftCalibration.height,
      });
      const thumb = camera.sampleThumbnail(boardRect);
      saveCalibration({
        ...draftCalibration,
        ts: Date.now(),
        ...(thumb ? { reference: Array.from(thumb) } : {}),
      });
    }
    if (frozen) URL.revokeObjectURL(frozen.url);
    setFrozen(null);
    setDraft([]);
    setMode(save ? 'try' : 'setup');
  };

  const handles: OverlayHandle[] = [
    { label: t.capture.landmarkTop, hint: t.capture.landmarkHintTop, point: draft[0] ?? { x: 0, y: 0 } },
    { label: t.capture.landmarkRight, hint: t.capture.landmarkHintRight, point: draft[1] ?? { x: 0, y: 0 } },
    { label: t.capture.landmarkBottom, hint: t.capture.landmarkHintBottom, point: draft[2] ?? { x: 0, y: 0 } },
    { label: t.capture.landmarkLeft, hint: t.capture.landmarkHintLeft, point: draft[3] ?? { x: 0, y: 0 } },
  ];

  // ---- try it ------------------------------------------------------------

  useEffect(() => {
    session.setCalibration(calibration);
  }, [session, calibration]);

  useEffect(() => {
    session.setCaller(callerEnabled);
  }, [session, callerEnabled]);

  useEffect(() => {
    if (mode === 'try') void session.findModel();
  }, [session, mode]);

  // The runtime and the model are only fetched once proposals are switched on.
  useEffect(() => {
    void session.switchModel(proposing);
  }, [session, proposing]);

  // It could not be loaded here: say so by switching back off.
  useEffect(() => {
    if (marking.model.status === 'unavailable') setProposing(false);
  }, [marking.model.status]);

  // Leaving try-it ends the visit: by the time anyone comes back the darts may
  // be out, or the camera recalibrated, and a carried mark would be a ghost.
  // Unmounting cannot ask, so it saves nothing: Back asks first (see leave()).
  useEffect(() => {
    if (mode !== 'try') session.end();
  }, [mode, session]);
  useEffect(() => () => session.end(), [session]);

  /** Where Done and Back go, once the session lets them. */
  const go = (exit: Exit | null) => {
    if (exit === 'done') setMode('setup');
    else if (exit === 'back') {
      if (cameraReturn) setScreen(cameraReturn);
      else goHome();
    }
  };

  /** Done or Back: straight away, unless there are marks nobody saved. */
  const leave = (exit: Exit) => go(session.leave(exit));

  /** Each saves or takes back a photograph, or may: the count follows. */
  const save = () => void session.save().then(refreshStats);
  const noNewDart = () => void session.noNewDart().then(refreshStats);
  const undo = () => void session.undo().then(refreshStats);
  const answer = (choice: 'save' | 'discard') =>
    void session.answer(choice).then((exit) => {
      void refreshStats();
      go(exit);
    });

  useEffect(
    () => () => {
      if (frozen) URL.revokeObjectURL(frozen.url);
    },
    [frozen],
  );

  // ---- export ------------------------------------------------------------

  const exportAll = async () => {
    setBusy(true);
    try {
      const frames = await listFrames(Number.MAX_SAFE_INTEGER);
      const blob = await exportFrames(frames);
      download(blob, `treblewise-captures-${new Date().toISOString().slice(0, 10)}.zip`);
    } finally {
      setBusy(false);
    }
  };

  const deleteAll = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setConfirmDelete(false);
    const frames = await listFrames(Number.MAX_SAFE_INTEGER);
    await Promise.all(frames.map((frame) => deleteFrame(frame.id)));
    void refreshStats();
  };

  const overlayToImage =
    mode === 'calibrate'
      ? draftCalibration?.toImage ?? null
      : staleCalibration
        ? null
        : calibration?.toImage ?? null;

  const ready = (cameraOn || paired) && calibration !== null && !staleCalibration;

  function coachMessage(): string {
    if (!photo && pullingOut) return t.capture.pullOut;
    if (!photo) return inBoard.length > 0 ? fill(t.capture.throwNext, { n: inBoard.length }) : t.capture.throwOne;
    if (photo.checking) return t.capture.looking;
    if (photo.proposed > 0 && !photo.edited) {
      const hits = photo.darts.slice(-photo.proposed).map((dart) => formatHit(dart.hit));
      return fill(t.capture.proposal, { hits: hits.join(', ') });
    }
    const fresh = photo.darts.length - photo.inBoard;
    if (fresh === 0 && photo.failed) return t.capture.modelFailed;
    if (fresh === 0 && photo.missed) return t.capture.modelSawNothing;
    if (fresh > 0) {
      return fill(t.capture.markedSoFar, { carried: photo.inBoard, fresh, total: photo.darts.length });
    }
    return photo.inBoard > 0 ? fill(t.capture.tapTheNewDart, { n: photo.inBoard }) : t.capture.tapTheDart;
  }

  return (
    <div className={`screen screen-capture${mode === 'try' ? ' screen-capture-try' : ''}`}>
      {/* One tree in every mode, so the video element is never remounted (it
          would lose its stream). The layout changes in CSS: in try-it on a wide
          screen the side column holds everything to read and press, and the
          board sits beside it; elsewhere it all stacks, board under the coach. */}
      <div className={`capture-work${mode === 'try' ? ' capture-work-split' : ''}`}>
        <div className="capture-side">
          <header className="screen-head">
            <h1>{t.capture.title}</h1>
            <Fold id="capture-about" summary={t.capture.foldAbout}>
              <p>{mode === 'try' ? t.capture.trySubtitle : t.capture.subtitle}</p>
            </Fold>
          </header>

          {!cameraSupported() && <p className="warning">{t.capture.noCamera}</p>}
          {camera.error && <p className="warning">{camera.error}</p>}
          {staleCalibration && mode !== 'calibrate' && (
            <p className="warning">
              {fill(t.capture.calibrateStale, {
                old: `${calibration!.width}×${calibration!.height}`,
                now: `${camera.width}×${camera.height}`,
              })}
            </p>
          )}

          {(cameraOn || paired) && mode !== 'try' && (
            <SetupCoach
              calibrated={mode === 'calibrate' ? draftCalibration !== null : calibration !== null}
              view={view}
              quality={camera.quality}
              showNumbers
            />
          )}

          {mode === 'try' && (
            <div className={`coach ${photo || pullingOut ? 'coach-warn' : 'coach-ready'}`} role="status">
              <span className="coach-dot" aria-hidden="true" />
              <span className="coach-message">{coachMessage()}</span>
            </div>
          )}

          {mode === 'try' && (cameraOn || paired) && (
            <p className="capture-status">
              {camera.moving ? t.capture.moving : t.capture.waiting} · {camera.motion.toFixed(1)} /{' '}
              {camera.change.toFixed(1)} · {fill(t.capture.photoSize, { size: `${camera.width}×${camera.height}` })}
              {camera.photo && ` · ${fill(t.capture.photoTime, { ms: camera.photo.ms, dropped: camera.photo.dropped })}`}
            </p>
          )}
          <PhoneBattery />

          {mode === 'try' && (
            <div className="capture-actions">
              <div className="controls">
                <button
                  type="button"
                  className="primary"
                  onClick={save}
                  disabled={!marking.canSave}
                >
                  {photo && photo.proposed > 0 && !photo.edited
                    ? t.capture.saveProposal
                    : photo && photo.darts.length > 0
                      ? fill(t.capture.saveFrame, { n: photo.darts.length })
                      : t.capture.saveFrameEmpty}
                </button>
                <button type="button" className="chip" onClick={session.skip} disabled={!photo}>
                  {t.capture.skipPhoto}
                </button>
                {photo && photo.proposed > 0 && !photo.edited && (
                  <button type="button" className="chip" onClick={noNewDart}>
                    {t.capture.noNewDart}
                  </button>
                )}
                <button
                  type="button"
                  className="chip"
                  onClick={session.boardCleared}
                  // Also the way out when the empty-board check cannot see the
                  // darts are gone (a shadow that was not there at calibration).
                  disabled={inBoard.length === 0 && (!photo || photo.inBoard === 0) && !pullingOut}
                >
                  {t.capture.boardCleared}
                </button>
                <button
                  type="button"
                  className="chip"
                  onClick={async () => {
                    const grabbed = await camera.capture();
                    if (grabbed) onSettle(grabbed);
                  }}
                  disabled={!camera.ready}
                >
                  {t.capture.captureNow}
                </button>
                <button
                  type="button"
                  className="chip"
                  onClick={undo}
                  disabled={!marking.canUndo}
                >
                  {t.capture.undo}
                </button>
                <button type="button" className="chip" onClick={() => leave('done')}>
                  {t.capture.doneTrying}
                </button>
              </div>
              {marking.leaving && (
                <div className="panel" role="alertdialog" aria-label={t.capture.unsavedTitle}>
                  <p>{t.capture.unsavedTitle}</p>
                  <div className="controls">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => answer('save')}
                    >
                      {t.capture.unsavedSave}
                    </button>
                    <button
                      type="button"
                      className="chip"
                      onClick={() => answer('discard')}
                    >
                      {t.capture.unsavedDiscard}
                    </button>
                    <button type="button" className="chip" onClick={() => void session.answer('stay')}>
                      {t.capture.unsavedStay}
                    </button>
                  </div>
                </div>
              )}

              {marking.marked.length > 0 && (
                <div className="throw-strip">
                  <span className="throw-who">{fill(t.capture.markedCount, { n: marking.marked.length })}</span>
                  <span className="throw-darts">
                    {marking.marked.slice(-4).map((entry) => (
                      <span key={entry.id} className="dart-chip">
                        {formatHit(entry.hit)}
                      </span>
                    ))}
                  </span>
                </div>
              )}

              <Fold id="capture-marking" summary={t.capture.foldMarking}>
                <p className="hint">
                  <b>{t.capture.markEveryDart}</b> {t.capture.tryHelp}
                </p>
              </Fold>
              {marking.saved && (
                <p className="hint">
                  {fill(t.capture.savedNote, {
                    n: marking.saved.length,
                    hits: marking.saved.map((dart) => formatHit(dart.hit)).join(', '),
                  })}
                </p>
              )}
              {marking.waiting && <p className="warning">{t.capture.photoWaiting}</p>}

              {modelInfo && (
                <section className="panel">
                  <div className="controls">
                    <button
                      type="button"
                      className={`chip${proposing ? ' chip-on' : ''}`}
                      onClick={() => setProposing((on) => !on)}
                    >
                      {proposing ? (marking.model.status === 'ready' ? t.capture.proposingOn : t.capture.proposingLoading) : t.capture.proposingOff}
                    </button>
                  </div>
                  {photo?.blind && <p className="hint">{t.capture.blindFrame}</p>}
                  <Fold id="capture-autoscorer" summary={t.capture.foldAutoscorer}>
                    <p className="hint">{proposing ? t.capture.proposingHelp : t.capture.proposingOffHelp}</p>
                  </Fold>
                  {marking.tally.letStand + marking.tally.corrected > 0 && (
                    <p className="hint">
                      {fill(t.capture.verdicts, {
                        right: marking.tally.letStand,
                        n: marking.tally.letStand + marking.tally.corrected,
                      })}
                    </p>
                  )}
                  <p className="hint">
                    {fill(t.capture.modelName, { name: modelInfo.name })}
                    {modelInfo.deepdarts && ` ${t.capture.deepdartsCredit}`}
                    {modelInfo.dartscribe && ` ${t.capture.dartscribeCredit}`}
                  </p>
                </section>
              )}

            </div>
          )}
        </div>

        <div className="stage" style={{ aspectRatio: crop ? '1 / 1' : `${frameSize.width} / ${frameSize.height}` }}>
          <div className="stage-frame" style={cropFrameStyle(crop, frameSize)}>
            <video ref={camera.videoRef} className="stage-video" playsInline muted />
            {mode === 'calibrate' && frozen && <img className="stage-frozen" src={frozen.url} alt="" />}
            {mode === 'try' && photo && <img className="stage-frozen" src={photo.url} alt="" />}

            <BoardOverlay
              width={frameSize.width}
              height={frameSize.height}
              toImage={overlayToImage}
              handles={mode === 'calibrate' ? handles : []}
              onHandleMove={(index, point) =>
                setDraft((points) => points.map((p, i) => (i === index ? point : p)))
              }
              darts={
                mode === 'try' && photo
                  ? photo.darts.map((dart, index) => ({
                      img: dart.img,
                      label: dart.by === 'model' ? `${formatHit(dart.hit)}?` : formatHit(dart.hit),
                      kind: index < photo.inBoard ? ('carried' as const) : dart.by === 'model' ? ('proposed' as const) : ('new' as const),
                    }))
                  : []
              }
              onDartMove={session.move}
              onTap={(point) => {
                if (mode === 'try') session.mark(point);
              }}
            />
          </div>
        </div>
      </div>

      {mode === 'calibrate' && (
        <section className="panel">
          <h2>{t.capture.calibrateTitle}</h2>
          <p className="hint">{t.capture.calibrateHelp}</p>
          <ul className="landmark-list">
            {handles.map((handle) => (
              <li key={handle.label}>
                <b>{handle.label}</b> {handle.hint}
              </li>
            ))}
          </ul>
          <p className="hint">
            {t.capture.calibrateError}:{' '}
            <b>{draftCalibration ? `${draftCalibration.error.toFixed(1)} px` : '—'}</b>
          </p>
          <div className="controls">
            <button
              type="button"
              className="primary"
              onClick={() => finishCalibration(true)}
              disabled={!draftCalibration}
            >
              {t.capture.calibrateSave}
            </button>
            <button type="button" className="chip" onClick={() => finishCalibration(false)}>
              {t.capture.calibrateCancel}
            </button>
          </div>
        </section>
      )}

      {mode === 'setup' && (
        <>
          <div className="controls">
            {paired ? (
              <span className="chip chip-on">{t.capture.phoneCamera}</span>
            ) : (
              <button
                type="button"
                className={`chip${cameraOn ? ' chip-on' : ''}`}
                onClick={() => setCameraOn((on) => !on)}
              >
                {cameraOn ? t.capture.stop : t.capture.start}
              </button>
            )}
            <button type="button" className="chip" onClick={() => void startCalibration()} disabled={!camera.ready}>
              {calibration ? t.capture.recalibrate : t.capture.calibrate}
            </button>
          </div>

          <button
            type="button"
            className="primary"
            onClick={() => {
              unlockCaller();
              setMode('try');
            }}
            disabled={!ready}
          >
            {t.capture.tryIt}
          </button>

          <section className="panel">
            <h2>{t.capture.stepsTitle}</h2>
            <ol className="steps">
              {t.capture.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        </>
      )}

      <section className="panel">
        <h2>{t.capture.frames}</h2>
        <p>
          <b>{stats.labelled}</b> {t.capture.labelled} ·{' '}
          {stats.bytes < 1_000_000
            ? `${Math.round(stats.bytes / 1000)} kB`
            : fill(t.capture.storage, { mb: (stats.bytes / 1_000_000).toFixed(1) })}
          {usage && usage.quota > 0 && ` / ${(usage.quota / 1_000_000_000).toFixed(1)} GB`}
        </p>
        <p className="hint">{t.capture.privacy}</p>
        <div className="controls">
          <button type="button" className="chip" onClick={() => void exportAll()} disabled={busy || stats.total === 0}>
            {stats.total === 0 ? t.capture.exportEmpty : t.capture.export}
          </button>
          <button type="button" className="chip" onClick={() => setScreen('review')} disabled={stats.total === 0}>
            {t.review.open}
          </button>
          <button type="button" className="chip" onClick={() => void deleteAll()} disabled={stats.total === 0}>
            {confirmDelete ? t.capture.deleteAllConfirm : t.capture.deleteAll}
          </button>
        </div>
      </section>

      <div className="screen-actions">
        <button type="button" className="chip" onClick={() => leave('back')}>
          {cameraReturn === 'game' ? t.capture.backToMatch : t.capture.back}
        </button>
      </div>
    </div>
  );
}
