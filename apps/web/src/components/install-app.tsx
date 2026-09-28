'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Check, Download, Share, SquarePlus, X } from 'lucide-react';
import { INSTALLABLE_EVENT } from './install-capture';
import { MobileSheetHandle } from './mobile-sheet-handle';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
declare global {
  interface Window {
    __wishsceneInstall?: InstallPromptEvent;
  }
}

/** 'native': the browser installs it (Chrome, Edge, Samsung). 'ios': Add to Home Screen steps. */
type Mode = 'native' | 'ios' | null;
type State = { mode: Mode; open: boolean };

const DISMISSED_KEY = 'wishscene:install-dismissed-at';
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const PHONE = '(max-width: 600px)';

const initial: State = { mode: null, open: false };
let state = initial;
let offered = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const getState = () => state;
const getInitial = () => initial;
function update(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function openSheet() {
  offered = true;
  update({ open: true });
}

function standalone() {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function iosHomeScreen() {
  const ua = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  // Only iOS WebKit has navigator.standalone; in-app browsers offer no Add to Home Screen.
  return ios && 'standalone' in navigator && !/FBAN|FBAV|Instagram|Line\/|GSA\/|TikTok/.test(ua);
}

function recentlyDismissed() {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISSED_KEY) ?? 0) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // Storage is blocked (private mode); the sheet is offered again next visit.
  }
}

/** For entry points such as the More sheet; hidden once installed or when installing isn't possible. */
export function useInstallApp() {
  const { mode } = useSyncExternalStore(subscribe, getState, getInitial);
  return { available: mode !== null, open: openSheet };
}

export function InstallApp() {
  const { mode, open } = useSyncExternalStore(subscribe, getState, getInitial);
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // The worker only adds an offline page; the app works the same without it.
    });
  }, []);

  useEffect(() => {
    if (standalone()) return;
    const adopt = () => {
      if (window.__wishsceneInstall) update({ mode: 'native' });
    };
    const installed = () => {
      window.__wishsceneInstall = undefined;
      update({ mode: null, open: false });
    };
    adopt();
    if (!window.__wishsceneInstall && iosHomeScreen()) update({ mode: 'ios' });
    window.addEventListener(INSTALLABLE_EVENT, adopt);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener(INSTALLABLE_EVENT, adopt);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  useEffect(() => {
    // Offer once per visit, from the studio on phones, never on sign-in or feedback pages.
    // Automated browsers (tests, crawlers) never get it unasked.
    if (!mode || offered || pathname !== '/') return;
    if (navigator.webdriver || !matchMedia(PHONE).matches) return;
    const timer = window.setInterval(
      () => {
        if (offered || recentlyDismissed()) return window.clearInterval(timer);
        // Wait until nothing else needs the screen: no open sheet and nobody typing.
        const typing = document.activeElement?.matches(
          'input, textarea, select, [contenteditable="true"]',
        );
        if (typing || document.querySelector('dialog[open]')) return;
        window.clearInterval(timer);
        openSheet();
      },
      mode === 'native' ? 1500 : 4000,
    );
    return () => window.clearInterval(timer);
  }, [mode, pathname]);

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    // Often opens unasked: start on the sheet itself, not its drag handle, so it's read out whole.
    dialog.focus();
    return () => {
      dialog.close();
      document.documentElement.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, [open]);

  const dismiss = () => {
    rememberDismissal();
    update({ open: false });
  };

  const install = async () => {
    const event = window.__wishsceneInstall;
    // The browser shows each install prompt once; a later beforeinstallprompt brings it back.
    window.__wishsceneInstall = undefined;
    update({ mode: null, open: false });
    if (!event) return;
    try {
      await event.prompt();
      if ((await event.userChoice).outcome === 'dismissed') rememberDismissal();
    } catch {
      // The browser declined to show it; its own menu still offers Install app.
    }
  };

  if (!mode || !open) return null;
  return (
    <dialog
      ref={ref}
      className="install-sheet"
      tabIndex={-1}
      aria-labelledby="install-title"
      aria-describedby="install-copy"
      onCancel={dismiss}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <MobileSheetHandle onClose={dismiss} />
      <div className="install-head">
        <img src="/icons/icon-192.png" alt="" width={56} height={56} />
        <div>
          <h2 id="install-title">Get the wishscene app</h2>
          <p id="install-copy">
            Add it to your home screen. It opens full screen, like any other app.
          </p>
        </div>
        <button className="icon-button" onClick={dismiss} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {mode === 'native' ? (
        <div className="install-actions">
          <button className="button subtle" onClick={dismiss}>
            Not now
          </button>
          <button className="button primary" onClick={() => void install()}>
            <Download aria-hidden="true" />
            Install app
          </button>
        </div>
      ) : (
        <>
          <ol className="install-steps">
            <li>
              <Share aria-hidden="true" />
              <span>
                Tap the <strong>Share</strong> button in your browser
              </span>
            </li>
            <li>
              <SquarePlus aria-hidden="true" />
              <span>
                Choose <strong>Add to Home Screen</strong>
              </span>
            </li>
            <li>
              <Check aria-hidden="true" />
              <span>
                Tap <strong>Add</strong>, then open wishscene from your home screen
              </span>
            </li>
          </ol>
          <div className="install-actions">
            <button className="button primary" onClick={dismiss}>
              Got it
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
