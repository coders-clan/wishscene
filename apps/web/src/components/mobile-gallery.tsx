'use client';

import { Children, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localeDirection } from '@/i18n/locales';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Native touch scrolling on phones; the supplied grid remains intact on desktop. */
export function MobileGallery({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className: string;
  label: string;
}) {
  const t = useTranslations('common');
  const rtl = localeDirection(useLocale()) === 'rtl';
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const count = Children.toArray(children).length;
  const [active, setActive] = useState(0);
  const current = Math.min(active, Math.max(0, count - 1));

  useEffect(() => {
    const track = ref.current!;
    const sync = () => {
      if (!window.matchMedia('(max-width: 600px)').matches) return;
      const edge = rtl ? 'right' : 'left';
      const start = track.getBoundingClientRect()[edge];
      let nearest = 0;
      let distance = Infinity;
      Array.from(track.children).forEach((child, index) => {
        const next = Math.abs(child.getBoundingClientRect()[edge] - start);
        if (next < distance) {
          nearest = index;
          distance = next;
        }
      });
      setActive(nearest);
    };
    track.addEventListener('scroll', sync, { passive: true });
    const resize = new ResizeObserver(sync);
    resize.observe(track);
    sync();
    return () => {
      track.removeEventListener('scroll', sync);
      resize.disconnect();
    };
  }, [count, rtl]);

  function go(index: number) {
    const track = ref.current!;
    const child = track.children[index];
    if (!child) return;
    const edge = rtl ? 'right' : 'left';
    track.scrollTo({
      left:
        track.scrollLeft +
        child.getBoundingClientRect()[edge] -
        track.getBoundingClientRect()[edge],
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }

  return (
    <div className="mobile-gallery" role="region" aria-label={label}>
      {count > 1 && (
        <div className="mobile-gallery-controls">
          <button
            type="button"
            aria-label={t('previousImage', { label })}
            aria-controls={id}
            disabled={current === 0}
            onClick={() => go(current - 1)}
          >
            <ChevronLeft size={20} />
          </button>
          <div className="mobile-gallery-position">
            <span role="status" aria-live="polite">
              {t('imagePosition', { current: current + 1, count })}
            </span>
            <div className="mobile-gallery-dots" aria-hidden="true">
              {Array.from({ length: count }, (_, index) => (
                <span key={index} className={index === current ? 'active' : ''} />
              ))}
            </div>
          </div>
          <button
            type="button"
            aria-label={t('nextImage', { label })}
            aria-controls={id}
            disabled={current === count - 1}
            onClick={() => go(current + 1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
      <div id={id} ref={ref} className={`${className} mobile-gallery-track`}>
        {children}
      </div>
    </div>
  );
}
