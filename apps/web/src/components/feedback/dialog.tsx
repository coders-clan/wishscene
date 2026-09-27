'use client';
import { useEffect, useRef } from 'react';
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
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
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
      aria-label={title}
    >
      <div className="feedback-dialog-heading">
        <div>
          <p className="eyebrow">WISHSCENE · BUILD TOGETHER</p>
          <h2>{title}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
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
