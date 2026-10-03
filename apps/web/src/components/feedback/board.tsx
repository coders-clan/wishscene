'use client';

import { useFormatter } from 'next-intl';
import { useUnsavedChanges } from '@/i18n/unsaved';
import { useCopy } from '@/i18n/copy';
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
  MessageCircle,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { GithubIcon } from '../github-icon';
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
  saveName,
  signOut,
} from './client';
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
  const msg = useCopy('feedback');
  const format = useFormatter();
  const timestamp = (value: string) =>
    format.dateTime(new Date(value), {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  const canContribute = !authRequired || !!authUser;
  const loginHref = `/api/auth/github?next=${encodeURIComponent(`/feedback?item=${id}`)}`;
  const [item, setItem] = useState<FeedbackItem | null>(null);
  const [draft, setDraft] = useState<Omit<FeedbackPatch, 'author'> | null>(null);
  const triageDirty = useRef(false);
  const [author, setAuthor] = useState('');
  const effectiveAuthor = authUser ? authUser.login : author;
  const [reply, setReply] = useState('');
  useUnsavedChanges(
    Boolean(
      reply ||
        (item &&
          draft &&
          (item.status !== draft.status ||
            item.priority !== draft.priority ||
            item.assignee !== draft.assignee)),
    ),
  );
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
        if (active) setError(msg.error(e));
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
      setError(msg.error(e));
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
      setError(msg('md722c2baff'));
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
      setError(msg.error(e));
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
      setNotice(msg('md14f3f9faa'));
      onChange();
    } catch (e) {
      setError(msg.error(e));
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(label);
    } catch {
      setError(msg('m0370cf6f31'));
    }
  }
  return (
    <FeedbackDialog
      title={item?.title || msg('m0c3c51dbac')}
      onClose={() => {
        if (busy) return;
        if ((reply.trim() || triageDirty.current) && !window.confirm(msg('m43f6f65733'))) return;
        onClose();
      }}
      wide
    >
      {!item ? (
        <p role="status">{error || msg('m53284c7e03')}</p>
      ) : (
        <div className="feedback-detail-grid">
          <div>
            <div className="feedback-tools">
              <span className={`feedback-status ${item.status}`}>{msg(`enum_${item.status}`)}</span>
              <span className={`feedback-chip priority-${item.priority}`}>
                {msg(`enum_${item.priority}`)}
              </span>
              <span className="feedback-chip">{msg(`enum_${item.category}`)}</span>
            </div>
            <p className="feedback-permission-note">
              {item.canEdit ? msg('md7a01b4ac8') : msg('md77313f028', { v0: item.author })}
            </p>
            <p className="feedback-description" dir="auto">
              {item.description}
            </p>
            <p className="feedback-hint">
              <bdi>{item.author}</bdi> · {timestamp(item.createdAt)}
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
                  alt={msg('m4b3cf350b6', { v0: item.title })}
                />
                <span>
                  <ExternalLink size={16} />
                  {msg('m344a46bb2f')}
                </span>
              </a>
            ) : (
              <div className="feedback-no-capture">
                <MessageSquarePlus />
                <p>{msg('m1fc115984a')}</p>
              </div>
            )}
            <div className="feedback-context">
              <strong>{item.target.label}</strong>
              <small>
                {item.target.path} · {item.target.viewport.width} × {item.target.viewport.height} ·{' '}
                {msg(`enum_${item.target.kind}`)}
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
                {msg('m467308aa2f')}
              </a>
              <button
                className="button"
                onClick={() =>
                  void copy(`${location.origin}/feedback?item=${id}`, msg('mc64a763709'))
                }
              >
                <Copy size={17} />
                {msg('m2f84eea5d4')}
              </button>
              <button
                className="button"
                onClick={() =>
                  downloadFile(JSON.stringify(item, null, 2), `wishscene-feedback-${id}.json`)
                }
              >
                <Download size={17} />
                {msg('m0ddb744236')}
              </button>
              {item.hasScreenshot && (
                <a
                  className="button"
                  href={`/api/feedback/${id}/image`}
                  download={`wishscene-feedback-${id}.jpg`}
                >
                  {msg('md6f34a97a5')}
                </a>
              )}
            </div>
          </div>
          <div className="feedback-thread">
            {item.canEdit && draft && (
              <div className="feedback-triage">
                <h3>
                  <SlidersHorizontal size={18} />
                  {msg('m78a5f6f839')}
                </h3>
                <p className="feedback-hint">{msg('m1f53079887')}</p>
                <div className="feedback-field-row">
                  <label>
                    {msg('mbae7d5be70')}
                    <select
                      aria-label={msg('mbae7d5be70')}
                      value={draft.status}
                      onChange={(e) => {
                        triageDirty.current = true;
                        setDraft({ ...draft, status: e.target.value as FeedbackPatch['status'] });
                      }}
                    >
                      {feedbackStatuses.map((value) => (
                        <option key={value} value={value}>
                          {msg(`enum_${value}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {msg('m886cbff9d9')}
                    <select
                      aria-label={msg('m886cbff9d9')}
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
                        <option key={value} value={value}>
                          {msg(`enum_${value}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  {msg('m049e3ce547')}
                  <input
                    maxLength={60}
                    placeholder={msg('m6a1ced9529')}
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
                    {msg('m179359b39e')}
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void refresh(true)
                        .then(() => setNotice(msg('m40a85d467b')))
                        .catch((e) => setError(msg.error(e)))
                    }
                  >
                    <RefreshCw size={16} />
                    {msg('m33af4d0999')}
                  </button>
                </div>
              </div>
            )}
            <div className="feedback-triage">
              <h3>{msg('m64f8729141')}</h3>
              {!canContribute ? (
                <div className="feedback-sign-in-card">
                  <p>{msg('m95b80460d5')}</p>
                  <a className="button primary" href={loginHref}>
                    <GithubIcon size={18} />
                    {msg('m103d26d100')}
                  </a>
                </div>
              ) : (
                <p className="feedback-hint">
                  {authUser ? msg('m0d3561d21f', { v0: authUser.login }) : msg('m0d2d86507b')}
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
                  {format.number(item.votes)} ·{' '}
                  {item.voted ? msg('mcddc250275') : msg('m2a99dfc1fa')}
                </button>
              )}
            </div>
            <h3>
              <MessageCircle size={18} />
              {msg('m85f0801073')}
            </h3>
            <div className="feedback-comments" aria-live="polite">
              {!item.comments.length && (
                <p className="feedback-hint">
                  {canContribute ? msg('m739a892c06') : msg('m8ad254e9d6')}
                </p>
              )}
              {item.comments.map((comment) => (
                <article key={comment.id} className={`feedback-comment ${comment.kind}`}>
                  <div>
                    <strong>
                      <bdi>{comment.author}</bdi>
                    </strong>
                    <time>{timestamp(comment.createdAt)}</time>
                  </div>
                  <p dir="auto">
                    {comment.kind === 'activity' && comment.changes
                      ? comment.changes
                          .map((change) =>
                            msg(`activity_${change.field}`, {
                              from:
                                change.field === 'assignee'
                                  ? change.from
                                  : msg(`enum_${change.from}`),
                              to:
                                change.field === 'assignee'
                                  ? change.to || msg('nobody')
                                  : msg(`enum_${change.to}`),
                            }),
                          )
                          .join(' · ')
                      : comment.text}
                  </p>
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
                    {msg('mab42293e29')}
                    <input
                      maxLength={60}
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder={msg('mc7874aaa0f')}
                    />
                  </label>
                )}
                <label>
                  {msg('m6c2bb735a4')}
                  <textarea
                    value={reply}
                    rows={3}
                    required
                    maxLength={2000}
                    onChange={(e) => {
                      setReply(e.target.value);
                      replyId.current = '';
                    }}
                    placeholder={msg('m94e2b9e111')}
                    dir="auto"
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  {msg('mcbb410663a')}
                </button>
              </form>
            )}
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void refresh()
                  .then(() => setNotice(msg('medeaec5326')))
                  .catch((e) => setError(msg.error(e)))
              }
            >
              <RefreshCw size={16} />
              {msg('m33af4d0999')}
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
  const msg = useCopy('feedback');
  const format = useFormatter();
  const timestamp = (value: string) =>
    format.dateTime(new Date(value), {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
        if (!controller.signal.aborted) setError(msg.error(e));
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
          {msg('mff43274984')}
          <span className="brand-dot">.</span>
        </a>
        <div className="feedback-tools">
          {authLoaded && authUser ? (
            <button className="button" onClick={() => void signOut()}>
              <GithubIcon size={18} />
              <span>
                {msg('m7317e100df')}
                {authUser.login}
              </span>
            </button>
          ) : authLoaded && authRequired ? (
            <a className="button primary" href="/api/auth/github?next=%2Ffeedback">
              <GithubIcon size={18} />
              <span>{msg('m103d26d100')}</span>
            </a>
          ) : null}
          <a className="button" href="/">
            <ArrowLeft size={18} />
            <span>{msg('ma4de9ec764')}</span>
          </a>
        </div>
      </header>
      <section className="feedback-board-intro">
        <div>
          <p className="eyebrow">{msg('mcaa060f59c')}</p>
          <h1>
            {msg('mc0ef46e686')}
            <span className="feedback-count">{list?.total ?? '…'}</span>
          </h1>
          <p>{msg('m4c72b18bbc')}</p>
        </div>
        <a className="button primary feedback-new-button" href="/">
          <Plus size={18} />
          {msg('m755b07bfae')}
        </a>
      </section>
      <div className="feedback-board-heading">
        <div>
          <h2>{msg('m88bc3fe3da')}</h2>
          <p>
            <span className="feedback-live-dot" />
            {error ? msg('m2690770bb8') : msg('m4216a9fad4')}
          </p>
        </div>
        <button className="button" onClick={() => setTick((x) => x + 1)}>
          <RefreshCw size={17} />
          {msg('m56e3badc4e')}
        </button>
      </div>
      <section className="feedback-filters" aria-label={msg('m86841772f5')}>
        <div className="feedback-filter-top">
          <label className="feedback-search">
            <Search size={19} />
            <input
              aria-label={msg('mbf5f259bae')}
              placeholder={msg('mcfaaebd5ff')}
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
            {msg('m96e578211a')}
            {activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
        </div>
        <div
          id="feedback-filter-controls"
          className={`feedback-filter-controls ${filtersOpen ? 'is-open' : ''}`}
        >
          <label>
            {msg('mbae7d5be70')}
            <select
              aria-label={msg('mf43653d7fa')}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
            >
              <option value="all">{msg('m6405179d24')}</option>
              {feedbackStatuses.map((x) => (
                <option key={x} value={x}>
                  {msg(`enum_${x}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {msg('m3deb745651')}
            <select
              aria-label={msg('me55aa1d9ec')}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setOffset(0);
              }}
            >
              <option value="all">{msg('m30c8a0fc9c')}</option>
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
              aria-label={msg('m870c2d046e')}
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setOffset(0);
              }}
            >
              <option value="all">{msg('mbc6ba0d1bb')}</option>
              {feedbackPriorities.map((x) => (
                <option key={x} value={x}>
                  {msg(`enum_${x}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {msg('madc4e96a47')}
            <select
              aria-label={msg('ma08eec9a7b')}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setOffset(0);
              }}
            >
              <option value="newest">{msg('mf5ec7772ca')}</option>
              <option value="votes">{msg('m5ee9a509a1')}</option>
            </select>
          </label>
          {(search || activeFilterCount || sort !== 'newest') && (
            <button type="button" className="button feedback-clear-filters" onClick={clearFilters}>
              {msg('m719ea396ad')}
            </button>
          )}
        </div>
      </section>
      {error && (
        <p className="feedback-error" role="alert">
          {error}{' '}
          <button className="button" onClick={() => setTick((x) => x + 1)}>
            {msg('m9f5cd8a2e8')}
          </button>
        </p>
      )}
      {loading && !list && <p role="status">{msg('m50042f3366')}</p>}
      {list && !list.items.length && !error && (
        <section className="feedback-empty">
          <CheckCircle2 size={42} />
          <h3>
            {search || status !== 'all' || category !== 'all' || priority !== 'all'
              ? msg('m6b0fe63b58')
              : msg('me269e99440')}
          </h3>
          <p>{list.total === 0 ? msg('mff021663d7') : msg('mbe367ba498')}</p>
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
                <span className={`feedback-status ${item.status}`}>
                  {msg(`enum_${item.status}`)}
                </span>
                <span className={`feedback-chip priority-${item.priority}`}>
                  {msg(`enum_${item.priority}`)}
                </span>
                <span className="feedback-category">{msg(`enum_${item.category}`)}</span>
              </div>
              <h3 dir="auto">{item.title}</h3>
              <p dir="auto">{item.description}</p>
              <div className="feedback-list-meta">
                <span>
                  <bdi>{item.author}</bdi> · {timestamp(item.createdAt)}
                </span>
                <span>
                  {msg(`enum_${item.target.kind}`)} · {item.target.label.slice(0, 55)}
                </span>
                {item.assignee && (
                  <span>
                    → <bdi>{item.assignee}</bdi>
                  </span>
                )}
              </div>
            </div>
            <div className="feedback-list-stats">
              <span>
                <ArrowUp size={17} />
                {format.number(item.votes)}
              </span>
              <span>
                <MessageCircle size={17} />
                {format.number(item.commentCount)}
              </span>
              {item.hasScreenshot && (
                <span className="feedback-image-badge">{msg('m60c152d92d')}</span>
              )}
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
            {msg('m50f94286ba')}
          </button>
          <span>
            {msg('pageCount', {
              start: offset + 1,
              end: Math.min(offset + 30, list.total),
              total: list.total,
            })}
          </span>
          <button
            className="button"
            disabled={offset + 30 >= list.total}
            onClick={() => setOffset(offset + 30)}
          >
            {msg('mbc981983e7')}
          </button>
        </div>
      )}
      <p className="feedback-board-footer">{msg('m013c4dc576')}</p>
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
