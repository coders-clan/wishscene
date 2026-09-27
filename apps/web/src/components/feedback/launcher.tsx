'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  MessageSquarePlus,
  MousePointer2,
  Scan,
  List,
  X,
  Send,
  Copy,
  Check,
  Github,
} from 'lucide-react';
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
            setContextNote('Reported element highlighted.');
          } else if (++tries < 15) setTimeout(locate, 300);
          else
            setContextNote(
              'This element has moved or belongs to another demo workspace. Check the report screenshot.',
            );
        };
        locate();
      } catch {
        setContextNote('Could not locate the reported element. Check the screenshot.');
      }
    }
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, []);
  useEffect(() => {
    if (!target) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [target]);
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
      setError(
        e instanceof Error ? e.message : 'Screenshot unavailable. You can still send feedback.',
      );
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
    if ((title || description || marks.length) && !window.confirm('Discard this unsent feedback?'))
      return;
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
            ? { ...target, excerpt: '', label: 'Redacted selection' }
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
      setError(e instanceof Error ? e.message : 'Could not send feedback.');
    } finally {
      setBusy(false);
    }
  }
  if (pathname === '/login' || !sessionLoaded) return null;
  if (authRequired && !authUser)
    return (
      <div data-feedback-ui className="feedback-launcher">
        {menu && (
          <div className="feedback-launch-menu">
            <strong>Make wishscene better</strong>
            <span>Sign in before adding feedback, replying or voting.</span>
            <a
              className="button primary"
              href={`/api/auth/github?next=${encodeURIComponent(pathname)}`}
            >
              <Github size={18} />
              Sign in with GitHub
            </a>
            <a className="button" href="/feedback">
              <List />
              View shared feedback
            </a>
          </div>
        )}
        <button
          className="button primary feedback-launch-button"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <MessageSquarePlus size={20} />
          Feedback
        </button>
      </div>
    );
  return (
    <div data-feedback-ui>
      {!mode && !target && !busy && (
        <div className="feedback-launcher">
          {menu && (
            <div className="feedback-launch-menu">
              <strong>Make wishscene better</strong>
              <span>Pick something. Tell the team.</span>
              <button
                className="button"
                onClick={() => {
                  setMode('element');
                  setMenu(false);
                }}
              >
                <MousePointer2 />
                Select an element
              </button>
              <button
                className="button"
                onClick={() => {
                  setMode('region');
                  setMenu(false);
                }}
              >
                <Scan />
                Capture a section
              </button>
              <button
                className="button"
                onClick={() => {
                  requestId.current = crypto.randomUUID();
                  setTarget(pageTarget());
                  setMenu(false);
                  setError('');
                }}
              >
                Write a general note
              </button>
              <a className="button" href="/feedback">
                <List />
                View shared feedback
              </a>
              {authUser && (
                <button className="button" onClick={() => void signOut()}>
                  Sign out
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
            Feedback
          </button>
        </div>
      )}
      {busy && !target && (
        <div className="feedback-capture-bar" role="status">
          Capturing your selection…
        </div>
      )}
      {mode && (
        <>
          <div className="feedback-capture-bar" role="status">
            <MousePointer2 size={20} />
            <span>
              {mode === 'element'
                ? 'Select an element to comment on. Tab + Enter also works.'
                : 'Drag around the section you want to capture.'}
            </span>
            <button
              className="button"
              onClick={() => {
                setMode(null);
                setRect(null);
              }}
            >
              <X size={18} />
              Cancel
            </button>
          </div>
          {mode === 'region' && (
            <div
              className="feedback-region-overlay"
              aria-label="Select screen region"
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
                if (r.width >= 10 && r.height >= 10) void capture(targetFor('region', r));
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
          title="Leave your mark"
          onClose={() => {
            if (!busy) close();
          }}
          wide
        >
          <p className="feedback-intro">
            Your report, screenshot and comments will be visible to everyone using this board.
          </p>
          <form ref={formRef} onSubmit={submit} className="feedback-report-form">
            <div className="feedback-capture-column">
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
                    Remove screenshot
                  </button>
                </>
              ) : (
                <div className="feedback-no-capture">
                  <MessageSquarePlus />
                  <p>A clear description works too.</p>
                  <span>No screenshot attached.</span>
                </div>
              )}
              {target.excerpt && (
                <div className="feedback-excerpt">
                  <small>Selected section text</small>
                  <p dir="auto">{target.excerpt}</p>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(target.excerpt)
                        .then(() => setCopyNote('Section text copied.'))
                        .catch(() =>
                          setCopyNote('Copy unavailable. Select and copy the text above.'),
                        );
                    }}
                  >
                    <Copy size={16} />
                    Copy section text
                  </button>
                  <span role="status">{copyNote}</span>
                </div>
              )}
            </div>
            <div className="feedback-fields">
              {authUser ? (
                <p className="feedback-hint">Posting as @{authUser.login}</p>
              ) : (
                <label>
                  Your name
                  <input
                    required
                    maxLength={60}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="How should the team know you?"
                  />
                </label>
              )}
              <label>
                Short title
                <input
                  required
                  minLength={3}
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What should we fix or improve?"
                />
              </label>
              <label>
                Comment
                <textarea
                  required
                  minLength={3}
                  maxLength={4000}
                  rows={6}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What happened? What did you expect? Include steps if this is a bug."
                  dir="auto"
                />
              </label>
              <div className="feedback-field-row">
                <label>
                  Type
                  <select
                    aria-label="Type"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as FeedbackCreate['category'])}
                  >
                    {feedbackCategories.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    aria-label="Priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as FeedbackCreate['priority'])}
                  >
                    {feedbackPriorities.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="feedback-hint">
                Preview before sending. Use Hide area for anything private. Names are display names,
                not verified accounts.
              </p>
              {error && (
                <p className="feedback-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary" disabled={busy}>
                <Send size={18} />
                {busy ? 'Sending…' : 'Send to shared board'}
              </button>
              <button type="button" className="button" disabled={busy} onClick={close}>
                Cancel
              </button>
            </div>
          </form>
        </FeedbackDialog>
      )}
      {success && (
        <div className="feedback-toast" role="status">
          <Check />
          <span>Feedback shared with the team.</span>
          <a href={`/feedback?item=${success}`}>Open report</a>
          <button
            className="icon-button"
            aria-label="Dismiss confirmation"
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
            aria-label="Dismiss context message"
            onClick={() => setContextNote('')}
          >
            <X />
          </button>
        </div>
      )}
    </div>
  );
}
