'use client';

import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import {
  cropPoint,
  cropRect,
  defaultSocialFocus,
  exportFrame,
  focusAt,
  maxSocialZoom,
  socialPlatforms,
  type SocialFocus,
  type SocialPlatform,
} from '@wishscene/contracts';

type Point = { x: number; y: number };
const middle = (points: Point[]) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

interface Props {
  image: string;
  alt: string;
  source: { width: number; height: number };
  platform: SocialPlatform;
  focus: SocialFocus;
  onApply: (focus: SocialFocus) => void;
  onClose: () => void;
}

// hunch-why: A full-screen editor shows the frame at a useful size with the trimmed parts dimmed around it, like phone photo apps. Drag and pinch move the source point under the fingers (focusAt), so the image follows them exactly. The sliders are the keyboard and single-pointer alternative to the gestures.
export function CropEditor({
  image,
  alt,
  source,
  platform,
  focus: initial,
  onApply,
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(initial);
  // Pointer and wheel events can arrive faster than renders; gestures read the latest focus here.
  const latest = useRef(initial);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ zoom: number; spread: number; point: Point } | null>(null);
  const [moving, setMoving] = useState(false);
  const preset = socialPlatforms[platform];
  const crop = cropRect(source, platform, focus);
  let size = '';
  try {
    const { width, height } = exportFrame(source, platform, focus);
    size = `Exports at ${width} × ${height} px`;
  } catch {
    size = 'This image is too small to export';
  }

  function set(next: SocialFocus) {
    latest.current = next;
    setFocus(next);
  }
  /** A viewport point as fractions of the crop frame; points outside it fall below 0 or above 1. */
  function inFrame(client: Point): Point {
    const box = frame.current!.getBoundingClientRect();
    if (!box.width || !box.height) return { x: 0.5, y: 0.5 };
    return { x: (client.x - box.left) / box.width, y: (client.y - box.top) / box.height };
  }
  /** Zoom while the image point under `client` (or the frame's center) stays in place. */
  function zoomTo(zoom: number, client?: Point) {
    const now = latest.current;
    const at = client ? inFrame(client) : { x: 0.5, y: 0.5 };
    set(focusAt(source, platform, now, zoom, cropPoint(source, platform, now, at), at));
  }
  // Each time a finger lands or lifts, restart the gesture from the current crop.
  function restart() {
    const touches = [...pointers.current.values()].slice(0, 2);
    setMoving(touches.length > 0);
    if (!touches.length) {
      gesture.current = null;
      return;
    }
    const now = latest.current;
    gesture.current = {
      zoom: now.zoom,
      spread: touches.length > 1 ? distance(touches[0], touches[1]) : 0,
      point: cropPoint(source, platform, now, inFrame(middle(touches))),
    };
  }
  // Zoom follows the pinch spread since the gesture began. The image point under the fingers is
  // re-read after each move, so after pushing past an edge the image responds as soon as they turn.
  function follow() {
    const start = gesture.current;
    if (!start) return;
    const touches = [...pointers.current.values()].slice(0, 2);
    const zoom =
      touches.length > 1 && start.spread
        ? (start.zoom * distance(touches[0], touches[1])) / start.spread
        : start.zoom;
    const at = inFrame(middle(touches));
    const next = focusAt(source, platform, latest.current, zoom, start.point, at);
    set(next);
    start.point = cropPoint(source, platform, next, at);
  }
  function release(id: number) {
    if (pointers.current.delete(id)) restart();
  }

  const onWheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault();
    // Trackpad pinches arrive as ctrl+wheel with small deltas; mouse wheels step in larger ones.
    // Some browsers report lines or pages instead of pixels.
    const pixels = event.deltaY * (event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? 400 : 1);
    const rate = event.ctrlKey ? 0.01 : 0.002;
    zoomTo(latest.current.zoom * Math.exp(-pixels * rate), {
      x: event.clientX,
      y: event.clientY,
    });
  });
  useEffect(() => {
    const dialog = ref.current!;
    const element = stage.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    const wheel = (event: WheelEvent) => onWheel(event);
    // Safari zooms the page on pinch unless its gesture events are cancelled.
    const block = (event: Event) => event.preventDefault();
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('gesturestart', block);
    element.addEventListener('gesturechange', block);
    return () => {
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('gesturestart', block);
      element.removeEventListener('gesturechange', block);
      dialog.close();
      document.documentElement.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);

  const room = { x: crop.width < source.width - 0.01, y: crop.height < source.height - 0.01 };
  const [ratioWidth, ratioHeight] = preset.aspect;
  const safe = preset.safeArea;
  return (
    <dialog
      ref={ref}
      className="crop-dialog"
      aria-labelledby="crop-title"
      aria-describedby="crop-size"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="crop-heading">
        <h2 id="crop-title">Adjust crop</h2>
        <p>
          {preset.label} · {preset.ratioLabel}
        </p>
        <p id="crop-size">{size}</p>
      </div>
      <div
        ref={stage}
        className="crop-stage"
        data-moving={moving || undefined}
        style={{ '--ratio-w': ratioWidth, '--ratio-h': ratioHeight } as CSSProperties}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          restart();
        }}
        onPointerMove={(event) => {
          if (!pointers.current.has(event.pointerId)) return;
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          follow();
        }}
        onPointerUp={(event) => release(event.pointerId)}
        onPointerCancel={(event) => release(event.pointerId)}
        onLostPointerCapture={(event) => release(event.pointerId)}
      >
        <div ref={frame} className="crop-frame">
          <img
            src={image}
            alt={alt}
            draggable={false}
            style={{
              left: `${(-crop.x / crop.width) * 100}%`,
              top: `${(-crop.y / crop.height) * 100}%`,
              width: `${(source.width / crop.width) * 100}%`,
              height: `${(source.height / crop.height) * 100}%`,
            }}
          />
          <span
            className="crop-safe-area"
            style={{ inset: `${safe.top}% ${safe.right}% ${safe.bottom}% ${safe.left}%` }}
          />
        </div>
      </div>
      <div className="crop-controls">
        <div className="crop-zoom">
          <label htmlFor="crop-zoom">Zoom</label>
          <ZoomOut size={18} aria-hidden="true" />
          <input
            id="crop-zoom"
            type="range"
            min={1}
            max={maxSocialZoom}
            step={0.01}
            value={focus.zoom}
            aria-valuetext={`${Math.round(focus.zoom * 100)}%`}
            onChange={(event) => zoomTo(Number(event.target.value))}
          />
          <ZoomIn size={18} aria-hidden="true" />
        </div>
        <div className="crop-position">
          <label>
            Horizontal position
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={focus.x}
              disabled={!room.x}
              aria-valuetext={`${Math.round(focus.x)}% from the left`}
              onChange={(event) => set({ ...latest.current, x: Number(event.target.value) })}
            />
          </label>
          <label>
            Vertical position
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={focus.y}
              disabled={!room.y}
              aria-valuetext={`${Math.round(focus.y)}% from the top`}
              onChange={(event) => set({ ...latest.current, y: Number(event.target.value) })}
            />
          </label>
        </div>
        <p className="fine-print">
          Drag the image to move it. Pinch, scroll or use Zoom to resize. Zooming in lowers the
          export size, because images are never upscaled.
        </p>
      </div>
      <div className="crop-actions">
        <button type="button" className="button" onClick={() => set({ ...defaultSocialFocus })}>
          <RotateCcw size={18} /> Reset
        </button>
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button primary" onClick={() => onApply(latest.current)}>
          Done
        </button>
      </div>
    </dialog>
  );
}
