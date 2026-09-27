'use client';

import { useEffect, useRef, type PointerEvent } from 'react';

/** Shared phone affordance; native dialogs retain focus trapping and Escape. */
export function MobileSheetHandle({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; y: number } | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    const dialog = ref.current?.closest('dialog');
    const viewport = window.visualViewport;
    if (!dialog || !viewport) return;
    const resize = () => {
      // Leave pinch zoom to the browser; follow the keyboard's visible viewport.
      if (viewport.scale !== 1) return;
      dialog.style.setProperty('--sheet-viewport-height', `${viewport.height}px`);
      dialog.style.setProperty(
        '--sheet-viewport-bottom',
        `${Math.max(0, innerHeight - viewport.height - viewport.offsetTop)}px`,
      );
    };
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', resize);
    return () => {
      viewport.removeEventListener('resize', resize);
      viewport.removeEventListener('scroll', resize);
      dialog.style.removeProperty('--sheet-viewport-height');
      dialog.style.removeProperty('--sheet-viewport-bottom');
    };
  }, []);

  const finish = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    if (drag.current?.id !== event.pointerId) return;
    const distance = event.clientY - drag.current.y;
    drag.current = null;
    event.currentTarget.closest('dialog')?.style.removeProperty('--sheet-drag-y');
    if (!cancelled && distance >= 80) onClose();
  };

  return (
    <button
      ref={ref}
      type="button"
      className="mobile-sheet-handle"
      aria-label="Dismiss sheet"
      onClick={(event) => {
        if (event.detail === 0 || !moved.current) onClose();
        moved.current = false;
      }}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        moved.current = false;
        drag.current = { id: event.pointerId, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current?.id !== event.pointerId) return;
        const distance = event.clientY - drag.current.y;
        if (Math.abs(distance) > 5) moved.current = true;
        event.currentTarget
          .closest('dialog')
          ?.style.setProperty('--sheet-drag-y', `${Math.max(0, distance)}px`);
      }}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => finish(event, true)}
    >
      <span aria-hidden="true" />
    </button>
  );
}
