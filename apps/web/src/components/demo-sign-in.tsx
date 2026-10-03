'use client';

import { useFormatter } from 'next-intl';
import { useCopy } from '@/i18n/copy';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Inbox, LogOut, Mail, MailCheck } from 'lucide-react';
import type { DemoAuth } from '@wishscene/contracts';

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
  const msg = useCopy('auth');
  const format = useFormatter();
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
            <strong>
              <bdi>{auth.account.email}</bdi>
            </strong>
            <span>{msg('m5a4d9cd3fb')}</span>
          </div>
        </div>
        <p>{msg('md40f1d76f7')}</p>
        <button className="button" disabled={busy} onClick={onSignOut}>
          <LogOut size={15} />
          {msg('mdc1649a16c')}
        </button>
        <p className="fine-print">{msg('m8f228be817')}</p>
      </div>
    );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onRequest(String(new FormData(event.currentTarget).get('email') ?? ''));
  };
  return (
    <div className="form-stack demo-sign-in">
      <p>{msg('m09c2edb8a1')}</p>
      <form className="form-stack" onSubmit={submit}>
        <label>
          {msg('mc94d3175a6')}
          <input
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            placeholder={msg('m50e2b46ef8')}
            maxLength={254}
            required
          />
        </label>
        <button className="button primary" disabled={busy}>
          <Mail size={16} />
          {msg('md59a4997e1')}
        </button>
      </form>
      <div className="info-box">
        <Inbox size={19} />
        <p>{msg('m8ab28d072c')}</p>
      </div>
      {auth.inbox.length > 0 && (
        <section ref={inbox} className="demo-inbox" aria-labelledby="demo-inbox-title">
          <h3 id="demo-inbox-title">{msg('m3d89c571e4')}</h3>
          <ul>
            {auth.inbox.map((message) => {
              const state = message.usedAt
                ? msg('mf51dc478de')
                : now >= Date.parse(message.expiresAt)
                  ? msg('m0bc7180ed8')
                  : null;
              return (
                <li key={message.id} className="demo-mail">
                  <div className="demo-mail-meta">
                    <span>{msg('mailHeader', { email: message.to })}</span>
                    <time dateTime={message.sentAt}>
                      {format.dateTime(new Date(message.sentAt), {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <h4>{msg('m3796d75805')}</h4>
                  <p>{msg('mc4e74f239e')}</p>
                  <button
                    className="button primary"
                    disabled={busy || state !== null}
                    onClick={() => onVerify(message.token)}
                  >
                    {state ?? msg('mf069f5c3c3')}
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
