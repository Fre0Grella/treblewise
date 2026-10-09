/**
 * A report (see CONTEXT.md): marking on the visit photo where the visit's darts
 * really landed. What it opens with, and what saving it makes: a labelled
 * photograph for training, if every dart is marked, and a correction for every
 * dart whose score moved.
 */

import { formatHit, type DartSource, type Hit, type Point } from '@treblewise/core';

import { projectToImage } from '../storage/frames.js';
import type { Calibration, CapturedFrame, LabelledDart } from '../storage/types.js';
import type { GrabbedFrame } from '../vision/camera.js';

/** A dart of the visit, as the report sees it. */
export interface ReportedDart {
  id: string;
  hit: Hit;
  pos?: Point;
  source?: DartSource;
}

export interface OpenedReport {
  /** One per dart of the visit, in order; null where it has no mark yet. */
  marks: (LabelledDart | null)[];
  /**
   * The marks the report opened with for darts tapped on the drawn board: a
   * point on a drawing, not the tip in the photograph. Left where they are,
   * the photograph is kept but waits in Review to be confirmed. Moving one
   * replaces it with a person's mark, which is no longer in this set.
   */
  boardPlaced: WeakSet<LabelledDart>;
}

/**
 * A marker pre-placed wherever a dart already has a position: correcting a
 * marker that is nearly right is much faster than placing three.
 */
export function openReport(darts: readonly ReportedDart[], calibration: Calibration): OpenedReport {
  const boardPlaced = new WeakSet<LabelledDart>();
  const marks = darts.map((dart) => {
    if (!dart.pos) return null;
    const mark: LabelledDart = {
      img: projectToImage(calibration, dart.pos),
      board: dart.pos,
      hit: dart.hit,
      // The autoscorer's own reading stays the model's until a person moves
      // it, so the trainer never grades the model against itself.
      ...(dart.source === 'auto' ? { by: 'model' as const } : {}),
    };
    if (dart.source !== 'auto') boardPlaced.add(mark);
    return mark;
  });
  return { marks, boardPlaced };
}

export interface SavedReport {
  /** The photograph to keep, or null when not every dart is marked. */
  frame: CapturedFrame | null;
  /** The darts whose score the marks moved. */
  corrections: { dartId: string; hit: Hit; pos: Point }[];
}

export function saveReport(input: {
  report: OpenedReport;
  darts: readonly ReportedDart[];
  photo: GrabbedFrame;
  calibration: Calibration;
  matchId: string;
  /** The model in use, recorded when one of its marks is kept. */
  modelName: string | null;
  id: string;
  ts: number;
}): SavedReport {
  const { report, darts, photo, calibration } = input;
  const labelled = report.marks.filter((mark): mark is LabelledDart => mark !== null);
  // A photograph is only a training example if every dart of the visit has a
  // mark on it. A dart entered on the keypad has no position, and left
  // unmarked it would teach the model that a dart it can see is background.
  const complete = darts.length > 0 && report.marks.length === darts.length && labelled.length === darts.length;
  const byModel = labelled.some((mark) => mark.by === 'model');
  // Marks a person placed or moved here, and the autoscorer's let stand, are
  // accepted as they are; a drawn-board tap left unmoved waits in Review.
  const confirmed = !labelled.some((mark) => report.boardPlaced.has(mark));

  const frame: CapturedFrame = {
    id: input.id,
    ts: input.ts,
    source: 'game',
    matchId: input.matchId,
    width: photo.width,
    height: photo.height,
    jpeg: photo.jpeg,
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
    ...(byModel && input.modelName ? { model: input.modelName } : {}),
    ...(confirmed ? { reviewed: true } : {}),
    reported: {
      hits: darts.map((dart) => formatHit(dart.hit)),
      dartIds: darts.map((dart) => dart.id),
      source: 'manual',
    },
  };

  // Anything whose score moved is corrected in the match as well, kept or not.
  const corrections = report.marks.flatMap((mark, index) => {
    const dart = darts[index];
    if (!mark || !dart) return [];
    if (mark.hit.value === dart.hit.value && mark.hit.ring === dart.hit.ring) return [];
    return [{ dartId: dart.id, hit: mark.hit, pos: mark.board }];
  });

  return { frame: complete ? frame : null, corrections };
}
