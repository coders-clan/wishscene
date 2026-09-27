'use client';
import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
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
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    requestAnimationFrame(() => dialog.querySelector<HTMLElement>('[data-dialog-close]')?.focus());
    return () => {
      dialog.close();
      document.documentElement.style.overflow = previousOverflow;
      previous?.focus();
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
        <div>
          <p className="eyebrow">WISHSCENE · BUILD TOGETHER</p>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          data-dialog-close
          onClick={onClose}
          aria-label="Close feedback dialog"
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
