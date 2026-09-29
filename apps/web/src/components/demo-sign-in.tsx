'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Inbox, LogOut, Mail, MailCheck } from 'lucide-react';
import type { DemoAuth } from '@wishscene/contracts';

const sentTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Emulated magic-link sign-in for the mock studio. The "email" is shown in an on-page inbox. */
export function DemoSignIn({
  auth,
  busy,
  onRequest,
  onVerify,
  onSignOut,
}: {
  auth: DemoAuth;
  busy: boolean;
  onRequest: (email: string) => void;
  onVerify: (token: string) => void;
  onSignOut: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  // A new message may land below the fold on phones, so bring it into view.
  const newest = auth.inbox[0]?.id;
  const seen = useRef(newest);
  const inbox = useRef<HTMLElement>(null);
  useEffect(() => {
    if (newest && newest !== seen.current)
      inbox.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    seen.current = newest;
  }, [newest]);
  if (auth.account)
    return (
      <div className="form-stack demo-sign-in">
        <div className="demo-account">
          <MailCheck size={22} />
          <div>
            <strong>{auth.account.email}</strong>
            <span>Signed in with a demo magic link</span>
          </div>
        </div>
        <p>
          This demo identity lives in this browser’s workspace. Nothing in the studio is locked
          behind it.
        </p>
        <button className="button" disabled={busy} onClick={onSignOut}>
          <LogOut size={15} />
          Sign out
        </button>
        <p className="fine-print">Resetting the demo workspace also forgets this address.</p>
      </div>
    );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onRequest(String(new FormData(event.currentTarget).get('email') ?? ''));
  };
  return (
    <div className="form-stack demo-sign-in">
      <p>
        Enter your email address and we’ll send you a one-time sign-in link. No password needed.
      </p>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            maxLength={254}
            required
          />
        </label>
        <button className="button primary" disabled={busy}>
          <Mail size={16} />
          Email me a sign-in link
        </button>
      </form>
      <div className="info-box">
        <Inbox size={19} />
        <p>
          Demo: no email is sent. The message appears in the demo inbox below, only in this browser.
        </p>
      </div>
      {auth.inbox.length > 0 && (
        <section ref={inbox} className="demo-inbox" aria-labelledby="demo-inbox-title">
          <h3 id="demo-inbox-title">Demo inbox</h3>
          <ul>
            {auth.inbox.map((message) => {
              const state = message.usedAt
                ? 'Link used'
                : now >= Date.parse(message.expiresAt)
                  ? 'Link expired'
                  : null;
              return (
                <li key={message.id} className="demo-mail">
                  <div className="demo-mail-meta">
                    <span>
                      From <strong>wishscene</strong> · to <strong>{message.to}</strong>
                    </span>
                    <time dateTime={message.sentAt}>{sentTime(message.sentAt)}</time>
                  </div>
                  <h4>Your wishscene sign-in link</h4>
                  <p>Tap the button to sign in. The link works once and expires in 10 minutes.</p>
                  <button
                    className="button primary"
                    disabled={busy || state !== null}
                    onClick={() => onVerify(message.token)}
                  >
                    {state ?? 'Sign in to wishscene'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
