/**
 * A photograph to put marks on: cropped to the board's square, with the board
 * and the marks drawn over it, and a magnifying lens that follows the mouse,
 * or the finger while it is down, to see whether a mark sits on its tip.
 *
 * Used where a person places or checks marks on a still photograph: Review,
 * and the in-game correction.
 */

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

import type { Region } from '../vision/camera.js';
import { cropFrameStyle } from '../vision/crop.js';
import { BoardOverlay, type BoardOverlayProps } from './BoardOverlay.js';
import { lensGeometry } from './lens.js';

export interface PhotoStageProps extends Omit<BoardOverlayProps, 'width' | 'height'> {
  url: string;
  /** The photograph's own size. */
  width: number;
  height: number;
  /** The part of the photograph to show (the board's square), or null for all of it. */
  crop: Region | null;
  /** Sizing, from the screen that uses it. */
  className?: string;
  style?: CSSProperties;
}

interface Pointer {
  x: number;
  y: number;
  stageWidth: number;
  stageHeight: number;
}

export function PhotoStage({ url, width, height, crop, className = '', style, ...overlay }: PhotoStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [pointer, setPointer] = useState<Pointer | null>(null);
  const pressed = useRef(false);

  // A pointer reports far more often than the screen redraws; only the
  // latest position matters, so the lens moves once per frame.
  const latest = useRef<Pointer | null>(null);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const track = (event: ReactPointerEvent) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0) return;
    latest.current = { x: event.clientX - rect.left, y: event.clientY - rect.top, stageWidth: rect.width, stageHeight: rect.height };
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        setPointer(latest.current);
      });
    }
  };
  const hide = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    latest.current = null;
    setPointer(null);
  };

  const lens =
    pointer &&
    lensGeometry(pointer, { width: pointer.stageWidth, height: pointer.stageHeight }, { width, height }, crop);

  return (
    <div
      className={`photo-stage ${className}`}
      style={style}
      // Watching only: the marks themselves are moved by the overlay, which
      // keeps the pointer captured while a mark is dragged.
      onPointerDown={(event) => {
        pressed.current = true;
        track(event);
      }}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse' || pressed.current) track(event);
      }}
      onPointerUp={(event) => {
        pressed.current = false;
        if (event.pointerType !== 'mouse') hide();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse' && !pressed.current) hide();
      }}
      onPointerCancel={() => {
        pressed.current = false;
        hide();
      }}
    >
      <div ref={stageRef} className="stage" style={{ aspectRatio: crop ? '1 / 1' : `${width} / ${height}` }}>
        <div className="stage-frame" style={cropFrameStyle(crop, { width, height })}>
          <img className="stage-frozen" src={url} alt="" />
          <BoardOverlay width={width} height={height} {...overlay} />
        </div>
      </div>

      {lens && (
        <div
          className="lens"
          aria-hidden="true"
          style={{ left: lens.left, top: lens.top, width: lens.size, height: lens.size }}
        >
          <div className="lens-content" style={lens.content}>
            <img className="stage-frozen" src={url} alt="" />
            <BoardOverlay width={width} height={height} toImage={overlay.toImage ?? null} darts={overlay.darts ?? []} />
          </div>
          <span className="lens-crosshair" />
        </div>
      )}
    </div>
  );
}
