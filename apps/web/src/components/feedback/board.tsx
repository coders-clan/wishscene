'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Filter,
  Github,
  MessageCircle,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  feedbackCategories,
  feedbackPriorities,
  feedbackStatuses,
  type FeedbackItem,
  type FeedbackList,
  type FeedbackPatch,
} from '@wishscene/contracts';
import { FeedbackDialog } from './dialog';
import {
  downloadFile,
  fetchAuthSession,
  feedbackRequest,
  readName,
  readable,
  saveName,
  signOut,
} from './client';
function timestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
type AuthUser = { login: string; name: string | null; avatarUrl: string };
function FeedbackDetail({
  id,
  authRequired,
  authUser,
  onClose,
  onChange,
}: {
  id: string;
  authRequired: boolean;
  authUser: AuthUser | null;
  onClose: () => void;
  onChange: () => void;
}) {
  const canContribute = !authRequired || !!authUser;
  const loginHref = `/api/auth/github?next=${encodeURIComponent(`/feedback?item=${id}`)}`;
  const [item, setItem] = useState<FeedbackItem | null>(null);
  const [draft, setDraft] = useState<Omit<FeedbackPatch, 'author'> | null>(null);
  const triageDirty = useRef(false);
  const [author, setAuthor] = useState('');
  const effectiveAuthor = authUser ? authUser.login : author;
  const [reply, setReply] = useState('');
  const replyId = useRef('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(
    async (reset = false) => {
      const value = await feedbackRequest<FeedbackItem>(`/${id}`);
      setItem((old) => (old && old.revision > value.revision ? old : value));
      if (!triageDirty.current || reset) {
        triageDirty.current = false;
        setDraft({
          expectedRevision: value.revision,
          status: value.status,
          priority: value.priority,
          assignee: value.assignee,
        });
      }
    },
    [id],
  );
  useEffect(() => {
    if (!authUser) setAuthor(readName());
    let active = true;
    const load = async () => {
      try {
        const value = await feedbackRequest<FeedbackItem>(`/${id}`);
        if (active) {
          setItem((old) => (old && old.revision > value.revision ? old : value));
          if (!triageDirty.current)
            setDraft({
              expectedRevision: value.revision,
              status: value.status,
              priority: value.priority,
              assignee: value.assignee,
            });
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);
  async function vote() {
    if (!canContribute) {
      location.href = loginHref;
      return;
    }
    if (!item) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const value = await feedbackRequest<FeedbackItem>(`/${id}/vote`, {
        method: 'PUT',
        body: JSON.stringify({ voted: !item.voted }),
      });
      setItem((old) => (old && old.revision > value.revision ? old : value));
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function postReply() {
    if (!canContribute) {
      location.href = loginHref;
      return;
    }
    if (!item || !reply.trim()) return;
    if (!authUser && !author.trim()) {
      setError('Add your name before posting.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    if (!authUser) saveName(author);
    replyId.current ||= crypto.randomUUID();
    try {
      const value = await feedbackRequest<FeedbackItem>(`/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          requestId: replyId.current,
          author: effectiveAuthor,
          text: reply,
        }),
      });
      setItem((old) => (old && old.revision > value.revision ? old : value));
      setReply('');
      replyId.current = '';
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveTriage() {
    if (!item?.canEdit || !draft) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const value = await feedbackRequest<FeedbackItem>(`/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...draft, author: effectiveAuthor }),
      });
      setItem(value);
      setDraft({
        expectedRevision: value.revision,
        status: value.status,
        priority: value.priority,
        assignee: value.assignee,
      });
      triageDirty.current = false;
      setNotice('Your report was updated.');
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(label);
    } catch {
      setError('Clipboard unavailable. Use Export report instead.');
    }
  }
  return (
    <FeedbackDialog
      title={item?.title || 'Feedback report'}
      onClose={() => {
        if (busy) return;
        if (
          (reply.trim() || triageDirty.current) &&
          !window.confirm('Discard your unsaved reply or report changes?')
        )
          return;
        onClose();
      }}
      wide
    >
      {!item ? (
        <p role="status">{error || 'Loading report…'}</p>
      ) : (
        <div className="feedback-detail-grid">
          <div>
            <div className="feedback-tools">
              <span className={`feedback-status ${item.status}`}>{readable(item.status)}</span>
              <span className={`feedback-chip priority-${item.priority}`}>{item.priority}</span>
              <span className="feedback-chip">{item.category}</span>
            </div>
            <p className="feedback-permission-note">
              {item.canEdit
                ? 'You created this report. You can edit its status, priority, and assignee.'
                : `You can vote and reply. Only ${item.author} can edit this report.`}
            </p>
            <p className="feedback-description" dir="auto">
              {item.description}
            </p>
            <p className="feedback-hint">
              {item.author} · {timestamp(item.createdAt)}
            </p>
            {item.hasScreenshot ? (
              <a
                href={`/api/feedback/${id}/image`}
                target="_blank"
                rel="noreferrer"
                className="feedback-image-link"
              >
                <img
                  src={`/api/feedback/${id}/image`}
                  alt={`Annotated screenshot: ${item.title}`}
                />
                <span>
                  <ExternalLink size={16} />
                  Open full screenshot
                </span>
              </a>
            ) : (
              <div className="feedback-no-capture">
                <MessageSquarePlus />
                <p>Text report · no screenshot</p>
              </div>
            )}
            <div className="feedback-context">
              <strong>{item.target.label}</strong>
              <small>
                {item.target.path} · {item.target.viewport.width} × {item.target.viewport.height} ·{' '}
                {item.target.kind}
              </small>
              {item.target.excerpt && <p dir="auto">{item.target.excerpt}</p>}
              {item.target.selector && <code>{item.target.selector}</code>}
            </div>
            <div className="feedback-tools">
              <a
                className="button"
                href={
                  item.target.selector
                    ? `${item.target.path}#feedback-target=${encodeURIComponent(item.target.selector)}`
                    : item.target.path
                }
              >
                <ExternalLink size={17} />
                Open page context
              </a>
              <button
                className="button"
                onClick={() =>
                  void copy(`${location.origin}/feedback?item=${id}`, 'Report link copied.')
                }
              >
                <Copy size={17} />
                Copy link
              </button>
              <button
                className="button"
                onClick={() =>
                  downloadFile(JSON.stringify(item, null, 2), `wishscene-feedback-${id}.json`)
                }
              >
                <Download size={17} />
                Export report
              </button>
              {item.hasScreenshot && (
                <a
                  className="button"
                  href={`/api/feedback/${id}/image`}
                  download={`wishscene-feedback-${id}.jpg`}
                >
                  Download image
                </a>
              )}
            </div>
          </div>
          <div className="feedback-thread">
            {item.canEdit && draft && (
              <div className="feedback-triage">
                <h3>
                  <SlidersHorizontal size={18} />
                  Edit your report
                </h3>
                <p className="feedback-hint">Only the report creator can change these fields.</p>
                <div className="feedback-field-row">
                  <label>
                    Status
                    <select
                      aria-label="Status"
                      value={draft.status}
                      onChange={(e) => {
                        triageDirty.current = true;
                        setDraft({ ...draft, status: e.target.value as FeedbackPatch['status'] });
                      }}
                    >
                      {feedbackStatuses.map((value) => (
                        <option key={value} value={value}>
                          {readable(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Priority
                    <select
                      aria-label="Priority"
                      value={draft.priority}
                      onChange={(e) => {
                        triageDirty.current = true;
                        setDraft({
                          ...draft,
                          priority: e.target.value as FeedbackPatch['priority'],
                        });
                      }}
                    >
                      {feedbackPriorities.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Assignee
                  <input
                    maxLength={60}
                    placeholder="Anyone on the team"
                    value={draft.assignee}
                    onChange={(e) => {
                      triageDirty.current = true;
                      setDraft({ ...draft, assignee: e.target.value });
                    }}
                  />
                </label>
                <div className="feedback-tools">
                  <button
                    className="button primary"
                    disabled={busy || !triageDirty.current}
                    onClick={() => void saveTriage()}
                  >
                    Save changes
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void refresh(true)
                        .then(() => setNotice('Latest report loaded.'))
                        .catch((e) => setError(e.message))
                    }
                  >
                    <RefreshCw size={16} />
                    Reload latest
                  </button>
                </div>
              </div>
            )}
            <div className="feedback-triage">
              <h3>Vote</h3>
              {!canContribute ? (
                <div className="feedback-sign-in-card">
                  <p>Sign in with GitHub to vote or reply.</p>
                  <a className="button primary" href={loginHref}>
                    <Github size={18} />
                    Sign in with GitHub
                  </a>
                </div>
              ) : (
                <p className="feedback-hint">
                  {authUser
                    ? `Voting as @${authUser.login}`
                    : 'Your vote is stored in this browser.'}
                </p>
              )}
              {canContribute && (
                <button
                  className={`button feedback-vote ${item.voted ? 'selected' : ''}`}
                  aria-pressed={item.voted}
                  disabled={busy}
                  onClick={() => void vote()}
                >
                  <ArrowUp size={18} />
                  {item.votes} · {item.voted ? 'You also noticed this' : 'I noticed this too'}
                </button>
              )}
            </div>
            <h3>
              <MessageCircle size={18} />
              Replies & activity
            </h3>
            <div className="feedback-comments" aria-live="polite">
              {!item.comments.length && (
                <p className="feedback-hint">
                  {canContribute ? 'Start the conversation.' : 'No replies yet.'}
                </p>
              )}
              {item.comments.map((comment) => (
                <article key={comment.id} className={`feedback-comment ${comment.kind}`}>
                  <div>
                    <strong>{comment.author}</strong>
                    <time>{timestamp(comment.createdAt)}</time>
                  </div>
                  <p dir="auto">{comment.text}</p>
                </article>
              ))}
            </div>
            {canContribute && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void postReply();
                }}
                className="feedback-fields"
              >
                {!authUser && (
                  <label>
                    Your name
                    <input
                      maxLength={60}
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder="Display name"
                    />
                  </label>
                )}
                <label>
                  Reply
                  <textarea
                    value={reply}
                    rows={3}
                    required
                    maxLength={2000}
                    onChange={(e) => {
                      setReply(e.target.value);
                      replyId.current = '';
                    }}
                    placeholder="Add details, a workaround, or an update…"
                    dir="auto"
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  Post reply
                </button>
              </form>
            )}
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void refresh()
                  .then(() => setNotice('Latest activity loaded.'))
                  .catch((e) => setError(e.message))
              }
            >
              <RefreshCw size={16} />
              Reload latest
            </button>
            {error && (
              <p className="feedback-error" role="alert">
                {error}
              </p>
            )}
            {notice && <p role="status">{notice}</p>}
          </div>
        </div>
      )}
    </FeedbackDialog>
  );
}
export function FeedbackBoard() {
  const [list, setList] = useState<FeedbackList | null>(null);
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState('all'),
    [category, setCategory] = useState('all'),
    [priority, setPriority] = useState('all'),
    [sort, setSort] = useState('newest');
  const [offset, setOffset] = useState(0),
    [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('item');
    if (id && /^[a-f0-9-]{36}$/i.test(id)) setSelected(id);
    void fetchAuthSession()
      .then((session) => {
        setAuthRequired(session.authRequired);
        setAuthUser(session.user);
      })
      .catch(() => setAuthRequired(true))
      .finally(() => setAuthLoaded(true));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval>;
    async function load() {
      try {
        const result = await feedbackRequest<FeedbackList>(
          `?${new URLSearchParams({ q: search, status, category, priority, sort, offset: String(offset) })}`,
          { signal: controller.signal },
        );
        setList(result);
        setError('');
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    setLoading(true);
    const debounce = setTimeout(() => {
      void load();
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') void load();
      }, 10000);
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(debounce);
      clearInterval(timer);
    };
  }, [search, status, category, priority, sort, offset, tick]);
  function open(id: string | null) {
    setSelected(id);
    history.replaceState(null, '', id ? `/feedback?item=${id}` : '/feedback');
  }
  const activeFilterCount = [status, category, priority].filter((value) => value !== 'all').length;
  function clearFilters() {
    setSearch('');
    setStatus('all');
    setCategory('all');
    setPriority('all');
    setSort('newest');
    setOffset(0);
  }
  return (
    <main className="feedback-board" id="main">
      <header className="feedback-board-header">
        <a className="wordmark" href="/">
          wishscene<span className="brand-dot">.</span>
        </a>
        <div className="feedback-tools">
          {authLoaded && authUser ? (
            <button className="button" onClick={() => void signOut()}>
              <Github size={18} />
              <span>Sign out @{authUser.login}</span>
            </button>
          ) : authLoaded && authRequired ? (
            <a className="button primary" href="/api/auth/github?next=%2Ffeedback">
              <Github size={18} />
              <span>Sign in with GitHub</span>
            </a>
          ) : null}
          <a className="button" href="/">
            <ArrowLeft size={18} />
            <span>Back to studio</span>
          </a>
        </div>
      </header>
      <section className="feedback-board-intro">
        <div>
          <p className="eyebrow">WISHSCENE · BUILD TOGETHER</p>
          <h1>
            Team feedback <span className="feedback-count">{list?.total ?? '…'}</span>
          </h1>
          <p>Report what you see, add context, and keep the conversation in one place.</p>
        </div>
        <a className="button primary feedback-new-button" href="/">
          <Plus size={18} />
          Add feedback in the studio
        </a>
      </section>
      <div className="feedback-board-heading">
        <div>
          <h2>Reports</h2>
          <p>
            <span className="feedback-live-dot" />
            {error ? 'Connection needs attention' : 'Shared board · refreshes every 10 seconds'}
          </p>
        </div>
        <button className="button" onClick={() => setTick((x) => x + 1)}>
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>
      <section className="feedback-filters" aria-label="Filter feedback">
        <div className="feedback-filter-top">
          <label className="feedback-search">
            <Search size={19} />
            <input
              aria-label="Search feedback"
              placeholder="Search reports, people or elements…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          <button
            type="button"
            className="button feedback-mobile-filter-button"
            aria-expanded={filtersOpen}
            aria-controls="feedback-filter-controls"
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <Filter size={17} />
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
        </div>
        <div
          id="feedback-filter-controls"
          className={`feedback-filter-controls ${filtersOpen ? 'is-open' : ''}`}
        >
          <label>
            Status
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
            >
              <option value="all">All statuses</option>
              {feedbackStatuses.map((x) => (
                <option key={x} value={x}>
                  {readable(x)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              aria-label="Filter by type"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setOffset(0);
              }}
            >
              <option value="all">All types</option>
              {feedbackCategories.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              aria-label="Filter by priority"
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setOffset(0);
              }}
            >
              <option value="all">All priorities</option>
              {feedbackPriorities.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Sort
            <select
              aria-label="Sort feedback"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setOffset(0);
              }}
            >
              <option value="newest">Newest first</option>
              <option value="votes">Most noticed</option>
            </select>
          </label>
          {(search || activeFilterCount || sort !== 'newest') && (
            <button type="button" className="button feedback-clear-filters" onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>
      </section>
      {error && (
        <p className="feedback-error" role="alert">
          {error}{' '}
          <button className="button" onClick={() => setTick((x) => x + 1)}>
            Retry
          </button>
        </p>
      )}
      {loading && !list && <p role="status">Loading the shared board…</p>}
      {list && !list.items.length && !error && (
        <section className="feedback-empty">
          <CheckCircle2 size={42} />
          <h3>
            {search || status !== 'all' || category !== 'all' || priority !== 'all'
              ? 'No matching feedback'
              : 'A fresh pair of eyes changes everything.'}
          </h3>
          <p>
            {list.total === 0
              ? 'Use the Feedback button to send a note, capture a section or select an element.'
              : 'Try a different filter.'}
          </p>
        </section>
      )}
      <div className="feedback-list" aria-busy={loading}>
        {list?.items.map((item) => (
          <button className="feedback-list-item" key={item.id} onClick={() => open(item.id)}>
            <div className="feedback-list-icon">
              <MessageSquarePlus size={23} />
            </div>
            <div className="feedback-list-content">
              <div className="feedback-tools">
                <span className={`feedback-status ${item.status}`}>{readable(item.status)}</span>
                <span className={`feedback-chip priority-${item.priority}`}>{item.priority}</span>
                <span className="feedback-category">{item.category}</span>
              </div>
              <h3 dir="auto">{item.title}</h3>
              <p dir="auto">{item.description}</p>
              <div className="feedback-list-meta">
                <span>
                  {item.author} · {timestamp(item.createdAt)}
                </span>
                <span>
                  {item.target.kind} · {item.target.label.slice(0, 55)}
                </span>
                {item.assignee && <span>→ {item.assignee}</span>}
              </div>
            </div>
            <div className="feedback-list-stats">
              <span>
                <ArrowUp size={17} />
                {item.votes}
              </span>
              <span>
                <MessageCircle size={17} />
                {item.commentCount}
              </span>
              {item.hasScreenshot && <span className="feedback-image-badge">Screenshot</span>}
              <ChevronRight className="feedback-list-chevron" aria-hidden="true" />
            </div>
          </button>
        ))}
      </div>
      {list && list.total > 30 && (
        <div className="feedback-pagination">
          <button
            className="button"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 30))}
          >
            Previous
          </button>
          <span>
            {offset + 1}–{Math.min(offset + 30, list.total)} of {list.total}
          </span>
          <button
            className="button"
            disabled={offset + 30 >= list.total}
            onClick={() => setOffset(offset + 30)}
          >
            Next
          </button>
        </div>
      )}
      <p className="feedback-board-footer">
        Shared with everyone on this deployment. Contributors use verified GitHub identities when
        sign-in is enabled. Preview captures before sharing.
      </p>
      {selected && (
        <FeedbackDetail
          id={selected}
          authRequired={!authLoaded || authRequired}
          authUser={authUser}
          onClose={() => open(null)}
          onChange={() => setTick((x) => x + 1)}
        />
      )}
    </main>
  );
}
