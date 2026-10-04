/**
 * The camera during a game, and the report flow.
 *
 * With the camera on, every settled throw is photographed and the latest frame
 * is held in memory. When a score is wrong — today because a finger slipped,
 * later because the autoscorer read it wrong — "Report" opens that photograph
 * and asks the one question worth asking: where did the dart actually land?
 *
 * The answer corrects the score *and* becomes a labelled training example from
 * exactly the setup and lighting that caused the mistake, which is the flywheel
 * `docs/03` is built around.
 *
 * With "autoscorer scores" on, each settled photograph is also read by the tip
 * model the way the capture lab reads it (vision/autoscore.ts), and a new dart
 * goes straight into the score as an 'auto' dart and is called. The player
 * corrects a wrong one by tapping it, and the correction keeps the model's
 * reading as the original, which is the agreement measure docs/03 asks for.
 * After a visit the darts have to come out first: until the board looks empty
 * again (or the next dart is entered by hand) nothing is read.
 */

import { assessBoardView, boardRegion, formatHit, type DartSource, type Hit, type Point } from '@treblewise/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fill, useStrings } from '../i18n/index.js';
import {
  projectToImage,
  putFrame,
  readDart,
  type CapturedFrame,
  type LabelledDart,
} from '../storage/frames.js';
import { useMatchStore } from '../store/match.js';
import { unlockCaller } from '../caller/caller.js';
import { unlockSounds } from '../caller/sounds.js';
import { newDarts } from '../vision/autoscore.js';
import { THUMB_SIZE, cameraSupported, type GrabbedFrame } from '../vision/camera.js';
import { loadDetector, loadManifest, type Detector, type ModelManifest } from '../vision/detector.js';
import { boardLooksEmpty } from '../vision/imageStats.js';
import { squareAround } from '../vision/crop.js';
import { useCamera } from '../vision/useCamera.js';
import { BoardOverlay } from './BoardOverlay.js';
import { PhoneBattery } from './PhoneBattery.js';
import { PhotoStage } from './PhotoStage.js';
import { SetupCoach } from './SetupCoach.js';

export interface ReportableDart {
  id: string;
  hit: Hit;
  pos?: Point;
  /** How it was entered: a dart the autoscorer did not read is photographed when it is entered. */
  source?: DartSource;
}

export interface GameCameraProps {
  matchId: string;
  /** The darts of the visit on the board right now. */
  darts: ReportableDart[];
  /** True once the visit is thrown: the moment to mark where they landed. */
  visitComplete: boolean;
  /** The darts above belong to the visit being thrown now, not the last one. */
  visitInProgress: boolean;
  /** The game says the finished visit's darts are out ("Darts out" was pressed): stop waiting for them. */
  visitClosed: boolean;
  /** Someone is to throw: the match is on and not won. */
  canThrow: boolean;
  onCorrect: (dartId: string, hit: Hit, pos: Point) => void;
  /** The autoscorer read a new dart. */
  onAutoDart: (hit: Hit, pos: Point, confidence: number) => void;
  /** The darts came out with `remaining` of the visit unthrown: those missed the board. */
  onDartsPulled: (remaining: number) => void;
  /** The darts of a finished visit came out: the next player is up. */
  onTurnPassed: () => void;
  /** Opens the report when it changes: the game's own "Mark where they landed", beside the dart being corrected. */
  reportRequests?: number;
  /** Whether a report can be opened now (a photograph of this visit, a calibration that fits it). */
  onReportAvailable?: (available: boolean) => void;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `frame-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function GameCamera({
  matchId,
  darts,
  visitComplete,
  visitInProgress,
  visitClosed,
  canThrow,
  onCorrect,
  onAutoDart,
  onDartsPulled,
  onTurnPassed,
  reportRequests = 0,
  onReportAvailable,
}: GameCameraProps) {
  const t = useStrings();
  const keepFrames = useMatchStore((s) => s.settings.keepFrames);
  const setKeepFrames = useMatchStore((s) => s.setKeepFrames);
  const calibration = useMatchStore((s) => s.settings.calibration);
  const openCameraSetup = useMatchStore((s) => s.openCameraSetup);
  const mode = useMatchStore((s) => s.mode);
  const remoteStream = useMatchStore((s) => s.remoteStream);
  const pairing = useMatchStore((s) => s.pairing);

  const [latest, setLatest] = useState<GrabbedFrame | null>(null);
  const [reporting, setReporting] = useState(false);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [marks, setMarks] = useState<(LabelledDart | null)[]>([]);
  /**
   * The marks the report opened with for darts tapped on the drawn board: a
   * point on a drawing, not the tip in the photograph. Left where they are,
   * the photograph is kept but waits in Review to be confirmed. Moving one
   * replaces it with a person's mark, which is no longer in this set.
   */
  const boardPlaced = useRef(new WeakSet<LabelledDart>());
  const [saved, setSaved] = useState<string | null>(null);
  // During a game the preview is clutter: the coach line says whether the
  // camera is happy, and that is all anyone needs mid-leg. It is one tap away
  // when something looks wrong.
  const [showPreview, setShowPreview] = useState(false);
  const latestRef = useRef<GrabbedFrame | null>(null);
  /**
   * The visit photo: the photograph taken when the visit's latest dart went
   * in. The report shows this one, not the newest: by the time someone reports
   * a dart, the newest photograph is often a hand pulling the darts out. And a
   * new photograph is compared with it for what changed, for the same reason:
   * the newest settle may be a hand reaching in, which would hide the dart
   * that came after it.
   */
  const visitFrameRef = useRef<GrabbedFrame | null>(null);
  const visitKey = useRef<{ first: string | undefined; count: number }>({ first: undefined, count: 0 });
  useEffect(() => {
    const first = darts[0]?.id;
    const seen = visitKey.current;
    if (first !== seen.first || darts.length > seen.count) visitFrameRef.current = latestRef.current;
    visitKey.current = { first, count: darts.length };
  }, [darts]);
  /** The photograph a report is open on: fixed for as long as it is open. */
  const [shown, setShown] = useState<GrabbedFrame | null>(null);

  // ---- the autoscorer -----------------------------------------------------
  const autoscore = useMatchStore((s) => s.settings.autoscoreGames);
  const setAutoscore = useMatchStore((s) => s.setAutoscoreGames);
  const [modelInfo, setModelInfo] = useState<ModelManifest | null>(null);
  const [detector, setDetector] = useState<Detector | null>(null);
  const [reading, setReading] = useState(false);
  const [pullingOut, setPullingOut] = useState(false);

  /** Everything a settle needs, as of the last render: settles arrive between renders. */
  const live = useRef({ darts, visitInProgress, canThrow, calibration, detector, autoscore, onAutoDart, onDartsPulled, onTurnPassed });
  live.current = { darts, visitInProgress, canThrow, calibration, detector, autoscore, onAutoDart, onDartsPulled, onTurnPassed };
  /** The visit just ended because its darts were seen coming out: nothing left to wait for. */
  const pulledRef = useRef(false);
  /** The empty board as it was just before this visit's first dart. */
  const recentEmptyRef = useRef<Uint8Array | null>(null);
  const awaitingEmptyRef = useRef(false);
  const busyRef = useRef(false);
  const queuedRef = useRef<GrabbedFrame | null>(null);

  const setAwaitingEmpty = (awaiting: boolean) => {
    awaitingEmptyRef.current = awaiting;
    setPullingOut(awaiting);
  };

  // A finished visit leaves its darts in the board until someone pulls them;
  // a dart of the next visit entered by hand means they are out.
  const lastVisitDone = visitComplete && darts.length > 0 && !visitInProgress;
  const nextVisitStarted = visitInProgress && darts.length > 0;
  useEffect(() => {
    if (!lastVisitDone) return;
    if (pulledRef.current) pulledRef.current = false;
    else setAwaitingEmpty(true);
  }, [lastVisitDone]);
  useEffect(() => {
    if (nextVisitStarted) setAwaitingEmpty(false);
  }, [nextVisitStarted]);
  useEffect(() => {
    if (visitClosed && awaitingEmptyRef.current) setAwaitingEmpty(false);
  }, [visitClosed]);

  useEffect(() => {
    if (!keepFrames) return;
    let cancelled = false;
    void loadManifest().then((loaded) => {
      if (!cancelled) setModelInfo(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [keepFrames]);

  useEffect(() => {
    if (!autoscore || !modelInfo || detector) return;
    let cancelled = false;
    void loadDetector().then((loaded) => {
      if (cancelled) return;
      setDetector(loaded);
      if (!loaded) setAutoscore(false); // it cannot run here: say so by switching back off
    });
    return () => {
      cancelled = true;
    };
  }, [autoscore, modelInfo, detector, setAutoscore]);

  const read = useCallback(async (frame: GrabbedFrame) => {
    const state = live.current;
    const model = state.detector;
    const calibrated = state.calibration;
    if (!model || !calibrated) return;
    const inVisit = state.visitInProgress ? state.darts : [];
    const carried = inVisit.map((dart) => ({ board: dart.pos! }));
    const previous = visitFrameRef.current;
    busyRef.current = true;
    setReading(true);
    try {
      const [best] = await newDarts(model, frame, calibrated, carried, inVisit.length > 0 ? previous : null);
      // Only if the visit is where it was: a dart entered by hand meanwhile wins.
      const now = live.current;
      const nowInVisit = now.visitInProgress ? now.darts.length : 0;
      if (best && now.autoscore && now.canThrow && nowInVisit === inVisit.length) {
        now.onAutoDart(best.hit, best.board, best.confidence);
      }
    } catch (cause) {
      console.warn('[treblewise] the autoscorer failed on a photograph:', cause);
    } finally {
      busyRef.current = false;
      setReading(false);
      const next = queuedRef.current;
      queuedRef.current = null;
      if (next) void readRef.current(next);
    }
  }, []);
  const readRef = useRef(read);
  readRef.current = read;

  const onSettle = useCallback((frame: GrabbedFrame, thumbnail?: Uint8Array, before?: Uint8Array | null) => {
    latestRef.current = frame;
    setLatest(frame);

    const state = live.current;
    const calibrated = state.calibration;
    const ready =
      state.autoscore &&
      state.detector !== null &&
      state.canThrow &&
      calibrated !== null &&
      calibrated.width === frame.width &&
      calibrated.height === frame.height;
    if (!ready) return;

    const references = [recentEmptyRef.current, calibrated.reference ? Uint8Array.from(calibrated.reference) : null];
    const empty =
      thumbnail !== undefined &&
      references.some((reference) => reference !== null && boardLooksEmpty(thumbnail, reference, THUMB_SIZE, THUMB_SIZE));

    if (awaitingEmptyRef.current) {
      if (empty) {
        setAwaitingEmpty(false);
        state.onTurnPassed();
      }
      return;
    }

    const inVisit = state.visitInProgress ? state.darts : [];
    // Out before the visit was thrown: the darts not in the board missed it.
    if (inVisit.length > 0 && inVisit.length < 3 && empty) {
      pulledRef.current = true;
      state.onDartsPulled(3 - inVisit.length);
      return;
    }
    // Three in already, or one entered by number with no position to tell it
    // apart from the next: that visit is the player's to finish.
    if (inVisit.length >= 3 || inVisit.some((dart) => !dart.pos)) return;
    if (inVisit.length === 0) {
      if (before) recentEmptyRef.current = before;
      if (empty) return;
    }

    if (busyRef.current) {
      queuedRef.current = frame;
      return;
    }
    void readRef.current(frame);
  }, []);

  // The capture trigger looks only at the board — see vision/settle.ts.
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
    active: keepFrames,
    onSettle,
    captureOnSettle: true,
    region,
    reference,
    stream: mode === 'paired' ? remoteStream : null,
    grab: mode === 'paired' && pairing ? () => pairing.requestPhoto() : null,
    // While a report is open nothing is photographed: a new photograph
    // re-rendered the card under the finger placing a marker, and flickered.
    paused: reporting,
  });

  // A dart entered by hand has no photograph of its own: it was not read, so
  // most likely it did not change the picture enough to be photographed (one
  // hidden behind another, say). Take one now, so the report shows it.
  const newestSeen = useRef<string | undefined>(undefined);
  useEffect(() => {
    const newest = darts.at(-1);
    if (!newest || newest.id === newestSeen.current) return;
    newestSeen.current = newest.id;
    if (newest.source === 'auto' || !keepFrames || !camera.ready) return;
    void camera.capture().then((photo) => {
      if (!photo || newestSeen.current !== newest.id) return;
      latestRef.current = photo;
      setLatest(photo);
      visitFrameRef.current = photo;
    });
    // The camera object changes every render; only a new dart matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darts]);

  const view = useMemo(
    () =>
      calibration
        ? assessBoardView(calibration.toImage, { width: calibration.width, height: calibration.height })
        : null,
    [calibration],
  );

  const usable =
    calibration !== null &&
    latest !== null &&
    calibration.width === latest.width &&
    calibration.height === latest.height;

  const canReport = keepFrames && usable && darts.length > 0;
  useEffect(() => {
    onReportAvailable?.(canReport);
  }, [canReport, onReportAvailable]);

  // The game asks for a report by bumping the counter.
  const reportsSeen = useRef(reportRequests);
  useEffect(() => {
    if (reportRequests === reportsSeen.current) return;
    reportsSeen.current = reportRequests;
    if (canReport && !reporting) openReport();
    // openReport is this render's; the request is what triggers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportRequests]);

  const openReport = () => {
    const photo =
      visitFrameRef.current && calibration && visitFrameRef.current.width === calibration.width
        ? visitFrameRef.current
        : latest;
    if (!photo || !calibration) return;
    const url = URL.createObjectURL(photo.jpeg);
    setShown(photo);
    setFrameUrl(url);
    // Pre-place a marker wherever a dart already has a position: correcting a
    // marker that is nearly right is much faster than placing three.
    boardPlaced.current = new WeakSet();
    setMarks(
      darts.map((dart) => {
        if (!dart.pos || !usable) return null;
        const mark: LabelledDart = {
          img: projectToImage(calibration, dart.pos),
          board: dart.pos,
          hit: dart.hit,
          // The autoscorer's own reading stays the model's until a person
          // moves it, so the trainer never grades the model against itself.
          ...(dart.source === 'auto' ? { by: 'model' as const } : {}),
        };
        if (dart.source !== 'auto') boardPlaced.current.add(mark);
        return mark;
      }),
    );
    setReporting(true);
  };

  const closeReport = () => {
    if (frameUrl) URL.revokeObjectURL(frameUrl);
    setFrameUrl(null);
    setShown(null);
    setReporting(false);
    setMarks([]);
  };

  const saveReport = async () => {
    const latest = shown;
    if (!latest || !calibration) return;

    const labelled = marks.filter((mark): mark is LabelledDart => mark !== null);
    // A photograph is only a training example if every dart of the visit has a
    // mark on it. A dart entered on the keypad has no position, and left
    // unmarked it would teach the model that a dart it can see is background.
    const complete = darts.length > 0 && marks.length === darts.length && labelled.length === darts.length;
    const byModel = labelled.some((mark) => mark.by === 'model');
    // Marks a person placed or moved here, and the autoscorer's let stand, are
    // accepted as they are; a drawn-board tap left unmoved waits in Review.
    const confirmed = !labelled.some((mark) => boardPlaced.current.has(mark));
    const frame: CapturedFrame = {
      id: newId(),
      ts: Date.now(),
      source: 'game',
      matchId,
      width: latest.width,
      height: latest.height,
      jpeg: latest.jpeg,
      calibration: {
        imagePoints: calibration.imagePoints,
        toImage: calibration.toImage,
        toBoard: calibration.toBoard,
        error: calibration.error,
        width: calibration.width,
        height: calibration.height,
      },
      darts: labelled,
      labelled: labelled.length > 0,
      ...(byModel && modelInfo ? { model: modelInfo.name } : {}),
      ...(confirmed ? { reviewed: true } : {}),
      reported: {
        hits: darts.map((dart) => formatHit(dart.hit)),
        dartIds: darts.map((dart) => dart.id),
        source: 'manual',
      },
    };
    if (complete) await putFrame(frame);

    // Anything whose score moved is corrected in the match as well, kept or not.
    let corrections = 0;
    marks.forEach((mark, index) => {
      const dart = darts[index];
      if (!mark || !dart) return;
      if (mark.hit.value === dart.hit.value && mark.hit.ring === dart.hit.ring) return;
      onCorrect(dart.id, mark.hit, mark.board);
      corrections += 1;
    });

    setSaved(
      [
        corrections > 0
          ? fill(t.report.scoreChanged, { score: labelled.map((mark) => formatHit(mark.hit)).join(' ') })
          : complete
            ? t.report.saved
            : '',
        complete ? '' : t.report.notKept,
      ]
        .filter(Boolean)
        .join(' '),
    );
    setTimeout(() => setSaved(null), 4000);
    closeReport();
  };

  useEffect(() => () => {
    if (frameUrl) URL.revokeObjectURL(frameUrl);
  }, [frameUrl]);

  if (!cameraSupported()) return null;

  const size = { width: camera.width || 1280, height: camera.height || 720 };
  const reportCrop =
    shown && region && calibration?.width === shown.width ? squareAround(region, shown) : null;

  return (
    <div className="game-camera">
      <div className="controls">
        <button
          type="button"
          className={`chip${keepFrames ? ' chip-on' : ''}`}
          onClick={() => setKeepFrames(!keepFrames)}
        >
          {keepFrames ? t.report.cameraOn : t.report.cameraOff}
        </button>
        {keepFrames && (
          <button
            type="button"
            className={visitComplete && usable && darts.length > 0 ? 'primary' : 'chip'}
            onClick={openReport}
            disabled={!usable || darts.length === 0}
          >
            {visitComplete ? t.report.markVisit : t.report.button}
          </button>
        )}
        {keepFrames && (
          <button type="button" className="chip" onClick={openCameraSetup}>
            {calibration ? t.report.cameraSetup : t.capture.calibrate}
          </button>
        )}
        {keepFrames && calibration && (
          <button
            type="button"
            className={`chip${showPreview ? ' chip-on' : ''}`}
            onClick={() => setShowPreview((on) => !on)}
          >
            {t.report.preview}
          </button>
        )}
      </div>

      {keepFrames && calibration && modelInfo && (
        <div className="controls">
          <button
            type="button"
            className={`chip${autoscore ? ' chip-on' : ''}`}
            onClick={() => {
              unlockCaller();
              unlockSounds();
              setAutoscore(!autoscore);
            }}
            disabled={!canThrow && !autoscore}
          >
            {autoscore ? (detector ? t.report.autoscoreOn : t.report.autoscoreLoading) : t.report.autoscoreOff}
          </button>
        </div>
      )}
      {keepFrames && calibration && modelInfo && autoscore && (
        <p className="hint">
          {pullingOut ? t.report.autoscorePullOut : reading ? t.report.autoscoreReading : t.report.autoscoreHelp}{' '}
          {fill(t.capture.modelName, { name: modelInfo.name })} {t.report.autoscoreUnchecked}
          {modelInfo.deepdarts && ` ${t.capture.deepdartsCredit}`}
          {modelInfo.dartscribe && ` ${t.capture.dartscribeCredit}`}
        </p>
      )}

      {saved && <p className="hint">{saved}</p>}

      {keepFrames && <PhoneBattery />}

      {keepFrames && camera.ready && (
        <SetupCoach calibrated={calibration !== null} view={view} quality={camera.quality} />
      )}

      {keepFrames && (
        <div
          className={`game-camera-preview${showPreview ? '' : ' game-camera-preview-hidden'}`}
          style={{
            aspectRatio: `${size.width} / ${size.height}`,
            // Cap the height by capping the width instead: clamping the height
            // of an aspect-ratio box squashes the picture, which is what this
            // preview used to do.
            maxWidth: `calc(30vh * ${(size.width / size.height).toFixed(4)})`,
          }}
        >
          <video ref={camera.videoRef} className="stage-video" playsInline muted />
          <BoardOverlay
            width={size.width}
            height={size.height}
            toImage={
              calibration && calibration.width === camera.width && calibration.height === camera.height
                ? calibration.toImage
                : null
            }
          />
          <div className="stage-badge">
            {camera.moving ? t.capture.moving : t.capture.waiting}
            {latest ? ` · ${t.capture.captured}` : ''}
          </div>
        </div>
      )}

      {keepFrames && !usable && latest !== null && <p className="hint">{t.capture.noCalibration}</p>}
      {keepFrames && latest === null && <p className="hint">{t.report.noFrame}</p>}

      {reporting && frameUrl && shown && (
        <div className="overlay overlay-report" role="dialog" aria-label={t.report.title}>
          <div className="report">
            <div className="report-side">
              <h2>{t.report.title}</h2>
              <p className="hint">{t.report.help}</p>

              <div className="chip-row">
                {darts.map((dart, index) => {
                  const mark = marks[index];
                  return (
                    <button
                      key={dart.id}
                      type="button"
                      className="chip"
                      onClick={() => setMarks((current) => current.map((m, i) => (i === index ? null : m)))}
                    >
                      {index + 1}: {formatHit(dart.hit)}
                      {mark && mark.hit.value !== dart.hit.value ? ` → ${formatHit(mark.hit)}` : ''}
                    </button>
                  );
                })}
              </div>

              <div className="controls">
                <button type="button" className="primary" onClick={() => void saveReport()}>
                  {t.report.save}
                </button>
                <button type="button" className="chip" onClick={closeReport}>
                  {t.report.cancel}
                </button>
              </div>
            </div>

            <PhotoStage
              className="report-board"
              url={frameUrl}
              width={shown.width}
              height={shown.height}
              crop={reportCrop}
              toImage={calibration?.toImage ?? null}
              darts={marks
                .map((mark, index) => ({ mark, index }))
                .filter(({ mark }) => mark !== null)
                .map(({ mark, index }) => ({
                  img: mark!.img,
                  label: `${index + 1} · ${formatHit(mark!.hit)}`,
                }))}
              onDartMove={(visibleIndex, point) => {
                if (!calibration) return;
                const indices = marks.map((mark, index) => (mark ? index : -1)).filter((index) => index >= 0);
                const target = indices[visibleIndex];
                if (target === undefined) return;
                setMarks((current) =>
                  current.map((mark, index) => (index === target ? readDart(calibration, point) : mark)),
                );
              }}
              onTap={(point) => {
                if (!calibration) return;
                const next = marks.findIndex((mark) => mark === null);
                if (next < 0) return;
                setMarks((current) =>
                  current.map((mark, index) => (index === next ? readDart(calibration, point) : mark)),
                );
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
