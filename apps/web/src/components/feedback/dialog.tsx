'use client';

import { useCopy } from '@/i18n/copy';
import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { MobileSheetHandle } from '../mobile-sheet-handle';
export function FeedbackDialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const msg = useCopy('feedback');
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    const frame = requestAnimationFrame(() =>
      dialog.querySelector<HTMLElement>('[data-dialog-close]')?.focus({ preventScroll: true }),
    );
    return () => {
      cancelAnimationFrame(frame);
      dialog.close();
      document.documentElement.style.overflow = previousOverflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      data-feedback-ui
      className={`feedback-dialog ${wide ? 'feedback-wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby={titleId}
    >
      <div className="feedback-dialog-heading">
        <MobileSheetHandle onClose={onClose} />
        <div>
          <p className="eyebrow">{msg('mcaa060f59c')}</p>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          data-dialog-close
          onClick={onClose}
          aria-label={msg('m28f939b066')}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
