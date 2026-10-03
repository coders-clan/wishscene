'use client';

import { useUnsavedChanges } from '@/i18n/unsaved';
import { useCopy } from '@/i18n/copy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquarePlus, MousePointer2, Scan, List, X, Send, Copy, Check } from 'lucide-react';
import { GithubIcon } from '../github-icon';
import type {
  Annotation,
  FeedbackCreate,
  FeedbackItem,
  FeedbackTarget,
} from '@wishscene/contracts';
import { feedbackCategories, feedbackPriorities } from '@wishscene/contracts';
import { pageTarget, screenshotSection, targetFor } from './capture';
import { annotatedJpeg, AnnotationEditor } from './annotation-editor';
import { FeedbackDialog } from './dialog';
import { fetchAuthSession, feedbackRequest, readName, saveName, signOut } from './client';

export function FeedbackLauncher() {
  const msg = useCopy('feedback');
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<'element' | 'region' | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );
  const [target, setTarget] = useState<FeedbackTarget | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [marks, setMarks] = useState<Annotation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [authUser, setAuthUser] = useState<{
    login: string;
    name: string | null;
    avatarUrl: string;
  } | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  useUnsavedChanges(Boolean(target && (title || description || marks.length)));
  const [category, setCategory] = useState<FeedbackCreate['category']>('bug');
  const [priority, setPriority] = useState<FeedbackCreate['priority']>('normal');
  const [copyNote, setCopyNote] = useState('');
  const [contextNote, setContextNote] = useState('');
  const requestId = useRef('');
  const start = useRef<{ x: number; y: number } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    setName(readName());
    void feedbackRequest('/session').catch(() => undefined);
    void fetchAuthSession()
      .then((session) => {
        setAuthRequired(session.authRequired);
        setAuthUser(session.user);
      })
      .catch(() => setAuthRequired(true))
      .finally(() => setSessionLoaded(true));
    function reveal() {
      if (!location.hash.startsWith('#feedback-target=')) return;
      try {
        const selector = decodeURIComponent(location.hash.slice(17));
        let tries = 0;
        const locate = () => {
          const el = document.querySelector<HTMLElement>(selector);
          if (el) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            el.classList.add('feedback-located');
            setTimeout(() => el.classList.remove('feedback-located'), 8000);
            setContextNote(msg('mb457c74efb'));
          } else if (++tries < 15) setTimeout(locate, 300);
          else setContextNote(msg('m33da2fd992'));
        };
        locate();
      } catch {
        setContextNote(msg('m8db2c44e45'));
      }
    }
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, []);
  const capture = useCallback(async (next: FeedbackTarget) => {
    setMode(null);
    setRect(null);
    setMenu(false);
    setBusy(true);
    setError('');
    setSource(null);
    setMarks([]);
    requestId.current = crypto.randomUUID();
    try {
      const image = await screenshotSection(next);
      setSource(image);
    } catch (e) {
      setError(msg.error(e));
    }
    setTarget(next);
    setBusy(false);
  }, []);
  useEffect(() => {
    if (!mode) return;
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMode(null);
        setRect(null);
      }
    }
    function move(e: PointerEvent) {
      if (
        mode !== 'element' ||
        !(e.target instanceof Element) ||
        e.target.closest('[data-feedback-ui]')
      )
        return;
      const el =
        e.target.closest<HTMLElement>('button, a, img, h1, h2, h3, p, [data-feedback-id]') ||
        (e.target as HTMLElement);
      const r = el.getBoundingClientRect();
      setRect({ x: r.x, y: r.y, width: r.width, height: r.height });
    }
    function select(e: MouseEvent) {
      if (
        mode !== 'element' ||
        !(e.target instanceof Element) ||
        e.target.closest('[data-feedback-ui]')
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      const el =
        e.target.closest<HTMLElement>('button, a, img, h1, h2, h3, p, [data-feedback-id]') ||
        (e.target as HTMLElement);
      const r = el.getBoundingClientRect();
      void capture(targetFor('element', { x: r.x, y: r.y, width: r.width, height: r.height }, el));
    }
    document.addEventListener('keydown', escape, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('click', select, true);
    document.body.classList.add('feedback-selecting');
    return () => {
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('click', select, true);
      document.body.classList.remove('feedback-selecting');
    };
  }, [mode, capture]);
  function close() {
    if ((title || description || marks.length) && !window.confirm(msg('mea910928be'))) return;
    setTarget(null);
    setTitle('');
    setDescription('');
    setSource(null);
    setMarks([]);
    setError('');
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || busy) return;
    setBusy(true);
    setError('');
    if (!authUser) saveName(name);
    try {
      const screenshot = source ? await annotatedJpeg(source, marks) : null;
      const item = await feedbackRequest<FeedbackItem>('', {
        method: 'POST',
        body: JSON.stringify({
          requestId: requestId.current,
          author: authUser ? authUser.login : name,
          title,
          description,
          category,
          priority,
          target: marks.some((mark) => mark.tool === 'redact')
            ? { ...target, excerpt: '', label: msg('m334af88301') }
            : target,
          screenshot,
          annotations: marks,
        }),
      });
      setSuccess(item.id);
      setTarget(null);
      setTitle('');
      setDescription('');
      setSource(null);
      setMarks([]);
    } catch (e) {
      setError(msg.error(e));
    } finally {
      setBusy(false);
    }
  }
  if (pathname === '/login' || pathname === '/feedback' || !sessionLoaded) return null;
  if (authRequired && !authUser)
    return (
      <div data-feedback-ui className="feedback-launcher">
        {menu && (
          <div className="feedback-launch-menu">
            <div className="feedback-launch-menu-heading">
              <div>
                <strong>{msg('mca8d3f4bfd')}</strong>
                <span>{msg('m03ee365725')}</span>
              </div>
              <button
                className="icon-button"
                aria-label={msg('mab0a8062f2')}
                onClick={() => setMenu(false)}
              >
                <X size={18} />
              </button>
            </div>
            <a
              className="button primary feedback-menu-action"
              href={`/api/auth/github?next=${encodeURIComponent(pathname)}`}
            >
              <GithubIcon size={18} />
              <span>
                <strong>{msg('m103d26d100')}</strong>
                <small>{msg('mbf4aa9b896')}</small>
              </span>
            </a>
            <a className="button feedback-menu-action" href="/feedback">
              <List />
              <span>
                <strong>{msg('m4aab865977')}</strong>
                <small>{msg('m067bb60db7')}</small>
              </span>
            </a>
          </div>
        )}
        <button
          className="button primary feedback-launch-button"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <MessageSquarePlus size={20} />
          {msg('mc8d7677e19')}
        </button>
      </div>
    );
  return (
    <div data-feedback-ui>
      {!mode && !target && !busy && (
        <div className="feedback-launcher">
          {menu && (
            <div className="feedback-launch-menu">
              <div className="feedback-launch-menu-heading">
                <div>
                  <strong>{msg('mca8d3f4bfd')}</strong>
                  <span>{msg('m369f56e231')}</span>
                </div>
                <button
                  className="icon-button"
                  aria-label={msg('mab0a8062f2')}
                  onClick={() => setMenu(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <button
                className="button feedback-menu-action"
                aria-label={msg('md188ad5eab')}
                onClick={() => {
                  setMode('element');
                  setMenu(false);
                }}
              >
                <MousePointer2 />
                <span>
                  <strong>{msg('md188ad5eab')}</strong>
                  <small>{msg('m33908fe53b')}</small>
                </span>
              </button>
              <button
                className="button feedback-menu-action"
                aria-label={msg('mb572419865')}
                onClick={() => {
                  setMode('region');
                  setMenu(false);
                }}
              >
                <Scan />
                <span>
                  <strong>{msg('mb572419865')}</strong>
                  <small>{msg('m6c4feee2b8')}</small>
                </span>
              </button>
              <button
                className="button feedback-menu-action"
                aria-label={msg('m198b915ae5')}
                onClick={() => {
                  requestId.current = crypto.randomUUID();
                  setTarget(pageTarget());
                  setMenu(false);
                  setError('');
                }}
              >
                <MessageSquarePlus />
                <span>
                  <strong>{msg('m198b915ae5')}</strong>
                  <small>{msg('mdbac5d143c')}</small>
                </span>
              </button>
              <a className="button feedback-menu-action" href="/feedback">
                <List />
                <span>
                  <strong>{msg('m4aab865977')}</strong>
                  <small>{msg('m6d12b2e3e0')}</small>
                </span>
              </a>
              {authUser && (
                <button className="button feedback-sign-out" onClick={() => void signOut()}>
                  {msg('mdc1649a16c')}
                </button>
              )}
            </div>
          )}
          <button
            className="button primary feedback-launch-button"
            aria-expanded={menu}
            onClick={() => {
              setMenu(!menu);
              setSuccess(null);
            }}
          >
            <MessageSquarePlus size={20} />
            {msg('mc8d7677e19')}
          </button>
        </div>
      )}
      {busy && !target && (
        <div className="feedback-capture-bar" role="status">
          {msg('mb1db7f9aa3')}
        </div>
      )}
      {mode && (
        <>
          <div className="feedback-capture-bar" role="status">
            <MousePointer2 size={20} />
            <span>{mode === 'element' ? msg('m42b31a6183') : msg('m01c9a0aeef')}</span>
            <button
              className="button"
              onClick={() => {
                setMode(null);
                setRect(null);
              }}
            >
              <X size={18} />
              {msg('m77dfd2135f')}
            </button>
          </div>
          {mode === 'region' && (
            <div
              className="feedback-region-overlay"
              aria-label={msg('m929de59c20')}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                start.current = { x: e.clientX, y: e.clientY };
                setRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
              }}
              onPointerMove={(e) => {
                if (!start.current) return;
                setRect({
                  x: Math.min(start.current.x, e.clientX),
                  y: Math.min(start.current.y, e.clientY),
                  width: Math.abs(e.clientX - start.current.x),
                  height: Math.abs(e.clientY - start.current.y),
                });
              }}
              onPointerUp={(e) => {
                if (!start.current) return;
                const r = {
                  x: Math.min(start.current.x, e.clientX),
                  y: Math.min(start.current.y, e.clientY),
                  width: Math.abs(e.clientX - start.current.x),
                  height: Math.abs(e.clientY - start.current.y),
                };
                start.current = null;
                if (r.width >= 10 && r.height >= 10)
                  void capture(targetFor('region', r, undefined, msg('selectedRegion')));
                else setRect(null);
              }}
              onPointerCancel={() => {
                start.current = null;
                setRect(null);
              }}
            />
          )}
          {rect && (
            <div
              className="feedback-selection"
              style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
            />
          )}
        </>
      )}
      {target && (
        <FeedbackDialog
          title={msg('me88e941c49')}
          onClose={() => {
            if (!busy) close();
          }}
          wide
        >
          <p className="feedback-intro">{msg('m2ab4877338')}</p>
          <form ref={formRef} onSubmit={submit} className="feedback-report-form">
            <div className="feedback-capture-column">
              <div className="feedback-form-section-heading">
                <span>1</span>
                <div>
                  <strong>{msg('m15f3ba0045')}</strong>
                  <small>{msg('mff9573c8d5')}</small>
                </div>
              </div>
              <div className="feedback-context">
                <span className="feedback-chip">{target.kind}</span>
                <strong>{target.label}</strong>
                <small>
                  {target.path} · {target.viewport.width} × {target.viewport.height}
                </small>
              </div>
              {source ? (
                <>
                  <AnnotationEditor source={source} marks={marks} onChange={setMarks} />
                  <button
                    type="button"
                    className="button subtle"
                    onClick={() => {
                      setSource(null);
                      setMarks([]);
                    }}
                  >
                    {msg('m05315c08fe')}
                  </button>
                </>
              ) : (
                <div className="feedback-no-capture">
                  <MessageSquarePlus />
                  <p>{msg('m4744733efb')}</p>
                  <span>{msg('m1473755a25')}</span>
                </div>
              )}
              {target.excerpt && (
                <div className="feedback-excerpt">
                  <small>{msg('m91a67da45a')}</small>
                  <p dir="auto">{target.excerpt}</p>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(target.excerpt)
                        .then(() => setCopyNote(msg('mda7b6b2f30')))
                        .catch(() => setCopyNote(msg('m9bda45d44e')));
                    }}
                  >
                    <Copy size={16} />
                    {msg('m9f81b0e99c')}
                  </button>
                  <span role="status">{copyNote}</span>
                </div>
              )}
            </div>
            <div className="feedback-fields">
              <div className="feedback-form-section-heading">
                <span>2</span>
                <div>
                  <strong>{msg('m12d332dbae')}</strong>
                  <small>{msg('m4d88ecedea')}</small>
                </div>
              </div>
              {authUser ? (
                <p className="feedback-hint">{msg('postingAccount', { name: authUser.login })}</p>
              ) : (
                <label>
                  {msg('mab42293e29')}
                  <input
                    required
                    maxLength={60}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={msg('meb4596af70')}
                  />
                </label>
              )}
              <label>
                {msg('md1c3c0e37d')}
                <input
                  required
                  minLength={3}
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={msg('ma92a216075')}
                />
              </label>
              <label>
                {msg('m153d7a58b3')}
                <textarea
                  required
                  minLength={3}
                  maxLength={4000}
                  rows={6}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={msg('m878586a474')}
                  dir="auto"
                />
              </label>
              <div className="feedback-field-row">
                <label>
                  {msg('m3deb745651')}
                  <select
                    aria-label={msg('m3deb745651')}
                    value={category}
                    onChange={(e) => setCategory(e.target.value as FeedbackCreate['category'])}
                  >
                    {feedbackCategories.map((x) => (
                      <option key={x} value={x}>
                        {msg(`enum_${x}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {msg('m886cbff9d9')}
                  <select
                    aria-label={msg('m886cbff9d9')}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as FeedbackCreate['priority'])}
                  >
                    {feedbackPriorities.map((x) => (
                      <option key={x} value={x}>
                        {msg(`enum_${x}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="feedback-hint">
                {msg('me385ee1daa')} {authUser ? msg('m80b1cf5a51') : msg('m86175321f3')}
              </p>
              {error && (
                <p className="feedback-error" role="alert">
                  {error}
                </p>
              )}
              <div className="feedback-form-actions">
                <button className="button primary" disabled={busy}>
                  <Send size={18} />
                  {busy ? msg('mcf765512cc') : msg('m7670a8c998')}
                </button>
                <button type="button" className="button" disabled={busy} onClick={close}>
                  {msg('m77dfd2135f')}
                </button>
              </div>
            </div>
          </form>
        </FeedbackDialog>
      )}
      {success && (
        <div className="feedback-toast" role="status">
          <Check />
          <span>{msg('mdfe49144c7')}</span>
          <a href={`/feedback?item=${success}`}>{msg('m44f83158c9')}</a>
          <button
            className="icon-button"
            aria-label={msg('m80b6c55bfc')}
            onClick={() => setSuccess(null)}
          >
            <X />
          </button>
        </div>
      )}
      {contextNote && (
        <div className="feedback-toast" role="status">
          <span>{contextNote}</span>
          <button
            className="icon-button"
            aria-label={msg('mcba571da23')}
            onClick={() => setContextNote('')}
          >
            <X />
          </button>
        </div>
      )}
    </div>
  );
}
