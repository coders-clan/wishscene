'use client';

import { ClientApiError } from '@/i18n/api-error';
import { useUnsavedChanges } from '@/i18n/unsaved';
import { useCopy } from '@/i18n/copy';
import { useFormatter } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  Code2,
  Compass,
  Copy,
  Download,
  Film,
  FolderHeart,
  Image as ImageIcon,
  Layers3,
  Loader2,
  MapPin,
  MoreHorizontal,
  MessageSquarePlus,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  UserRound,
  WandSparkles,
  X,
} from 'lucide-react';
import type {
  Asset,
  DemoAuth,
  Experience,
  ExperienceInput,
  ExportManifest,
  GenerationInput,
  Scene,
  Workspace,
} from '@wishscene/contracts';
import {
  demoPresets,
  demoPreview,
  hasPhotoPreset,
  socialPlatforms,
  type SceneSocial,
  type SocialPack,
} from '@wishscene/contracts';
import { SocialComposer } from './social-composer';
import { PackEditor, type PackCover } from './pack-editor';
import { MobileSheetHandle } from './mobile-sheet-handle';
import { useInstallApp } from './install-app';
import { MobileGallery } from './mobile-gallery';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from './language-switcher';
import { DemoSignIn } from './demo-sign-in';

async function api<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    cache: 'no-store',
  });
  const value = await response.json();
  if (!response.ok) throw new ClientApiError(value.error?.code ?? 'GENERIC');
  return value;
}
const moods: ExperienceInput['mood'][] = ['After hours', 'Slow living', 'Golden hour', 'Adventure'];
const destinations: ExperienceInput['destination'][] = ['Tokyo', 'Kyoto', 'Amalfi', 'Iceland'];
const activeJob = (status: string) => status === 'queued' || status === 'running';
type Modal =
  | 'new'
  | 'story'
  | 'developer'
  | 'identity'
  | 'library'
  | 'help'
  | 'review'
  | 'more'
  | 'account'
  | null;

function DemoLookFields({
  destination,
  initial,
}: {
  destination: ExperienceInput['destination'];
  initial?: Pick<ExperienceInput, 'outfit' | 'mood'>;
}) {
  const msg = useCopy('studio');
  const demo = useCopy('demo');
  const preset = demoPresets[destination];
  const [outfit, setOutfit] = useState(initial?.outfit ?? preset.outfit);
  const [mood, setMood] = useState<ExperienceInput['mood']>(initial?.mood ?? preset.mood);
  const matched = hasPhotoPreset({ destination, outfit, mood });
  return (
    <>
      <label>
        {msg('mb70b4cb228')}
        <input
          name="outfit"
          value={outfit}
          onChange={(event) => setOutfit(event.target.value)}
          minLength={3}
          maxLength={100}
          required
        />
      </label>
      <label>
        {msg('me4d2b11047')}
        <select
          name="mood"
          value={mood}
          onChange={(event) => setMood(event.target.value as ExperienceInput['mood'])}
        >
          {moods.map((value) => (
            <option key={value} value={value}>
              {demo(value.replaceAll(' ', '_'))}
            </option>
          ))}
        </select>
      </label>
      <div className="preset-note" aria-live="polite">
        <strong>{matched ? msg('md2828392f0') : msg('m88f26ff67b')}</strong>
        <p>{matched ? msg('m7b835a175f', { v0: destination }) : msg('m81ebc5142b')}</p>
        {!matched && (
          <button
            type="button"
            className="button"
            onClick={() => {
              setOutfit(preset.outfit);
              setMood(preset.mood);
            }}
          >
            {msg('usePreset', { destination: demo(destination) })}
          </button>
        )}
      </div>
    </>
  );
}

function ModalFrame({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const msg = useCopy('studio');
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.documentElement.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <MobileSheetHandle onClose={onClose} />
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id="modal-title">{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={msg('m7b29020292')}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export default function Studio() {
  const msg = useCopy('studio');
  const demo = useCopy('demo');
  const format = useFormatter();
  const t = useTranslations('common');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [experienceId, setExperienceId] = useState('tokyo-after-hours');
  const [modal, setModal] = useState<Modal>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [tab, setTab] = useState<'storyboard' | 'social' | 'motion'>('storyboard');
  const [storyExpanded, setStoryExpanded] = useState(false);
  const [scenario, setScenario] = useState<GenerationInput['scenario']>('success');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [caption, setCaption] = useState('');
  const [captionDirty, setCaptionDirty] = useState(false);
  const [socialDirty, setSocialDirty] = useState(false);
  const [packDirty, setPackDirty] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  useUnsavedChanges(captionDirty || socialDirty || packDirty || formDirty);
  const [packCover, setPackCover] = useState<PackCover | null>(null);
  const [socialSceneId, setSocialSceneId] = useState<string | null>(null);
  // Phones show one part of Posts at a time so each fits the screen; desktop shows all four.
  const [postView, setPostView] = useState<'write' | 'preview' | 'carousel' | 'caption'>('write');
  const [workspaceReset, setWorkspaceReset] = useState(0);
  const [newDestination, setNewDestination] = useState<ExperienceInput['destination']>('Tokyo');
  const mounted = useRef(true);
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const data = await api<Workspace>('workspace');
      if (mounted.current) setWorkspace(data);
    } finally {
      refreshing.current = false;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh().catch((e) => setError(msg.error(e)));
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  const hasJobs = workspace?.jobs.some((job) => activeJob(job.status));
  useEffect(() => {
    if (!hasJobs) return;
    const timer = setInterval(() => {
      void refresh().catch((e) => setError(msg.error(e)));
    }, 650);
    return () => clearInterval(timer);
  }, [hasJobs, refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5500);
    return () => clearTimeout(timer);
  }, [notice]);
  const experience =
    workspace?.experiences.find((item) => item.id === experienceId) ?? workspace?.experiences[0];
  const scene = experience?.scenes.find((item) => item.id === sceneId);
  const photoPreset = experience ? hasPhotoPreset(experience) : false;
  useEffect(() => {
    setCaption(experience?.caption ?? '');
    setCaptionDirty(false);
  }, [experience?.id, experience?.caption]);
  const account = workspace?.demoAuth.account ?? null;
  const approved = experience?.scenes.filter((item) => item.status === 'approved').length ?? 0;
  const jobs =
    workspace?.jobs.filter((job) => job.experienceId === experience?.id && activeJob(job.status)) ??
    [];
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(msg.error(e));
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    setFormDirty(false);
    setModal(null);
  };
  // Apply the returned sign-in state directly; a refresh can be skipped while a job poll is in flight.
  const demoAuth = (path: string, payload: unknown, message: string) =>
    run(async () => {
      const auth = await api<DemoAuth>(`demo/auth/${path}`, 'POST', payload);
      setWorkspace((current) => (current ? { ...current, demoAuth: auth } : current));
      setNotice(message);
    });
  const installApp = useInstallApp();
  const openScene = (item: Scene) => {
    setSceneId(item.id);
    setModal('review');
  };
  const generate = async (item: Scene) => {
    await api(`experiences/${experience!.id}/scenes/${item.id}/generations`, 'POST', {
      scenario,
      requestKey: crypto.randomUUID(),
    });
  };
  const approve = (item: Scene, asset: Asset) =>
    run(async () => {
      await api(`experiences/${experience!.id}/scenes/${item.id}/approval`, 'POST', {
        assetId: asset.id,
        expectedVersion: experience!.bibleVersion,
      });
      setNotice(msg('m6b2fb75bdb'));
    });
  const exportPack = () =>
    run(async () => {
      const manifest = await api<ExportManifest>(
        `experiences/${experience!.id}/exports`,
        'POST',
        {},
      );
      const [{ default: JSZip }, { renderPostImage }] = await Promise.all([
        import('jszip'),
        import('../lib/social-render'),
      ]);
      const zip = new JSZip();
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
      zip.file('caption.txt', manifest.caption);
      zip.file('README.txt', msg('m84c5cffd52', { v0: manifest.provenance }));
      await Promise.all(
        manifest.assets.map(async (asset) => {
          const response = await fetch(asset.image);
          if (!response.ok) throw new Error(msg('md2d72af867'));
          zip.file(asset.filename, await response.arrayBuffer());
          zip.file(
            asset.output.filename,
            await renderPostImage(asset, manifest.coverTitle, msg('disclosure')),
          );
          const { output, social } = asset;
          const stem = output.filename.slice(output.filename.lastIndexOf('/') + 1, -'.jpg'.length);
          zip.file(
            `posts/${stem}.txt`,
            msg('mb64d5d8753', {
              v0: msg(`platform_${social.platform}`),
              v1: asset.title,
              v2: output.filename,
              v3: output.width,
              v4: output.height,
              v5: output.aspectRatio,
              v6: social.caption,
              v7:
                socialPlatforms[social.platform].vertical && social.overlayText
                  ? msg('exportOverlay', { text: social.overlayText })
                  : '',
            }),
          );
        }),
      );
      const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `wishscene-${manifest.destination.toLowerCase()}-demo.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(msg('m8eab16f6d2'));
    });
  const submitExperience = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (socialDirty || packDirty) {
      setError(msg('m17453d4efa'));
      return;
    }
    const data = new FormData(e.currentTarget);
    void run(async () => {
      const created = await api<Experience>('experiences', 'POST', Object.fromEntries(data));
      setExperienceId(created.id);
      setTab('storyboard');
      close();
      setNotice(msg('m49022e1e94'));
    });
  };
  const submitStory = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (socialDirty) {
      setError(msg('m1870958a4d'));
      return;
    }
    const data = new FormData(e.currentTarget);
    void run(async () => {
      await api(`experiences/${experience!.id}/story`, 'PATCH', {
        ...Object.fromEntries(data),
        expectedVersion: experience!.bibleVersion,
      });
      close();
      setNotice(msg('m579fee9ecb'));
    });
  };
  const selectExperience = (id: string) => {
    if ((socialDirty || packDirty) && id !== experienceId) {
      setError(msg('m2b1f80a10b'));
      return;
    }
    setExperienceId(id);
    setTab('storyboard');
    close();
  };
  function mobileScreen(next: 'storyboard' | 'social') {
    setTab(next);
    close();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t('skip')}
      </a>
      <aside className="sidebar">
        <a href="/" className="wordmark" aria-label={t('home')}>
          <span className="brand-icon">
            <Sparkles size={21} />
          </span>
          {msg('mff43274984')}
          <span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">{t('creativeSpace')}</div>
        <nav aria-label={t('navigation')}>
          <a className="nav-item" href="/feedback">
            {t('feedback')}
          </a>
          <button
            className="nav-item active"
            onClick={() => {
              setTab('storyboard');
              close();
            }}
          >
            <Clapperboard />
            {t('studio')}
            <span className="nav-dot" />
          </button>
          <button className="nav-item" onClick={() => setModal('library')}>
            <FolderHeart />
            {t('experiences')}
            <span className="nav-count">{workspace?.experiences.length ?? 3}</span>
          </button>
          <button className="nav-item" onClick={() => setModal('identity')}>
            <Layers3 />
            {t('identity')}
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="small-spark">✳</span>
          <h3>
            {msg('mbeaab15203')}
            <br />
            {msg('m00e0448cb9')}
          </h3>
          <p>{msg('mdd216c3215')}</p>
          <button onClick={() => setModal('new')}>
            {msg('me9ae293dcc')}
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setModal('developer')}>
            <Code2 />
            {t('developer')}
          </button>
          <button className="nav-item" onClick={() => setModal('help')}>
            <CircleHelp />
            {t('tour')}
          </button>
          <div className="profile">
            <span className="avatar">{msg('m6dcd4ce23d')}</span>
            <div>
              <strong>{msg('mab9944bc64')}</strong>
              <span>{account?.email ?? t('demoWorkspace')}</span>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <a className="mobile-brand" href="/" aria-label={t('home')}>
            <Sparkles size={20} /> {msg('mff43274984')}
            <span>.</span>
          </a>
          <div className="breadcrumb">
            {t('workspace')} <ChevronRight size={14} />
            <strong>{t('studio')}</strong>
          </div>
          <div className="topbar-actions">
            <LanguageSwitcher />
            <button className="button primary" onClick={() => setModal('new')}>
              <Plus size={18} />
              {t('newExperience')}
            </button>
            <button
              className="demo-pill account-pill"
              aria-haspopup="dialog"
              aria-label={account ? t('signedIn', { email: account.email }) : t('signIn')}
              disabled={!workspace}
              onClick={() => setModal('account')}
            >
              <UserRound size={14} />
              {account ? (
                <b className="account-email">
                  <bdi>{account.email}</bdi>
                </b>
              ) : (
                t('signIn')
              )}
            </button>
            <button className="demo-pill" onClick={() => setModal('developer')}>
              <span />
              {t('mockMode')} <Code2 size={14} />
            </button>
          </div>
        </header>
        <main id="main">
          <section className="greeting" data-feedback-id="studio-greeting">
            <div>
              <p className="eyebrow">
                <span className="violet-star">✳</span> {t('eyebrow')}
              </p>
              <h1>
                {t('heading')} <em>{t('headingEmphasis')}</em>
              </h1>
              <p>{t('subtitle')}</p>
            </div>
          </section>
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button onClick={() => setError('')} aria-label={msg('m347aaa77ff')}>
                <X size={16} />
              </button>
            </div>
          )}
          {!experience ? (
            <section className="loading-state">
              <Sparkles size={40} />
              <h2>{error ? msg('m322e7bf08d') : msg('mace3708c50')}</h2>
              <p>{msg('m470a30a7bf')}</p>
              {error && (
                <button
                  className="button"
                  onClick={() => void refresh().catch((e) => setError(msg.error(e)))}
                >
                  {msg('m9f5cd8a2e8')}
                </button>
              )}
            </section>
          ) : (
            <>
              <section className="experience-heading">
                <div className="experience-title">
                  <span className="experience-mark">
                    <Compass size={22} />
                  </span>
                  <div>
                    <button className="title-button" onClick={() => setModal('library')}>
                      <h2 dir="auto">{experience.title}</h2>
                      <ChevronDown size={19} />
                    </button>
                    <p>
                      <MapPin size={12} />
                      {experience.destination} <span>·</span>
                      {msg('m043f0bcaf0')}
                      <span>·</span>
                      {msg('m58129edb79')}
                    </p>
                  </div>
                </div>
                <button className="button subtle" onClick={() => setModal('story')}>
                  <Settings2 size={16} />
                  {msg('m4ecc309963')}
                </button>
              </section>
              <div
                className={`story-strip ${storyExpanded ? 'is-expanded' : ''}`}
                data-feedback-id="story-settings"
              >
                <button
                  className="story-title"
                  aria-label={msg('mac4205ae58')}
                  aria-expanded={storyExpanded}
                  onClick={() => setStoryExpanded((value) => !value)}
                >
                  <BookOpen size={17} />
                  <strong>{msg('m93dbf1b6fd')}</strong>
                  <span className="version">
                    {msg('version', { version: experience.bibleVersion })}
                  </span>
                  <ChevronDown size={16} className="mobile-story-chevron" />
                </button>
                <div className="story-detail">
                  <span>{msg('m274ad8f838')}</span>
                  <strong>{msg('mab9944bc64')}</strong>
                </div>
                <div className="story-detail outfit">
                  <span>{msg('mde42400c95')}</span>
                  <strong dir="auto">{experience.outfit}</strong>
                </div>
                <div className="story-detail">
                  <span>{msg('mfca272339c')}</span>
                  <strong>{experience.mood}</strong>
                </div>
                <span className="story-consistency">
                  <Check size={14} />
                  {msg('m72be53cd18')}
                </span>
              </div>
              <div className={`demo-photo-note ${photoPreset ? '' : 'custom'}`}>
                <ImageIcon size={15} />
                <span>{photoPreset ? msg('mee0e54992d') : msg('ma680ea9a63')}</span>
                {!photoPreset && (
                  <button type="button" onClick={() => setModal('story')}>
                    {msg('m7479e1e9f8')}
                  </button>
                )}
              </div>
              <div className="section-tabs">
                <div
                  role="tablist"
                  aria-label={msg('m249e09da7e')}
                  onKeyDown={(event) => {
                    const tabs = ['storyboard', 'social', 'motion'] as const;
                    const index = tabs.indexOf(tab);
                    const next =
                      event.key === 'ArrowRight'
                        ? tabs[(index + 1) % 3]
                        : event.key === 'ArrowLeft'
                          ? tabs[(index + 2) % 3]
                          : event.key === 'Home'
                            ? tabs[0]
                            : event.key === 'End'
                              ? tabs[2]
                              : null;
                    if (next) {
                      event.preventDefault();
                      setTab(next);
                      document.getElementById(`tab-${next}`)?.focus();
                    }
                  }}
                >
                  <button
                    role="tab"
                    tabIndex={tab === 'storyboard' ? 0 : -1}
                    id="tab-storyboard"
                    aria-controls="panel-storyboard"
                    aria-selected={tab === 'storyboard'}
                    className={tab === 'storyboard' ? 'selected' : ''}
                    onClick={() => setTab('storyboard')}
                  >
                    <ImageIcon size={16} />
                    {msg('m7c293d6707')}
                    <span>04</span>
                  </button>
                  <button
                    role="tab"
                    tabIndex={tab === 'social' ? 0 : -1}
                    id="tab-social"
                    aria-controls="panel-social"
                    aria-selected={tab === 'social'}
                    className={tab === 'social' ? 'selected' : ''}
                    onClick={() => setTab('social')}
                  >
                    <Layers3 size={16} />
                    {msg('m4341dbd9d9')}
                  </button>
                  <button
                    role="tab"
                    tabIndex={tab === 'motion' ? 0 : -1}
                    id="tab-motion"
                    aria-controls="panel-motion"
                    aria-selected={tab === 'motion'}
                    className={tab === 'motion' ? 'selected' : ''}
                    onClick={() => setTab('motion')}
                  >
                    <Film size={16} />
                    {msg('me040db2b7f')}
                    <span className="soon">{msg('m1992d5e8d5')}</span>
                  </button>
                </div>
                <span className="saved-state">
                  <span />
                  {msg('m7464109985')}
                </span>
              </div>
              {tab === 'storyboard' && (
                <section role="tabpanel" id="panel-storyboard" aria-labelledby="tab-storyboard">
                  <div className="board-heading">
                    <div>
                      <h3>{msg('m20e1bd8099')}</h3>
                      <p>{msg('m724255b6b5')}</p>
                    </div>
                    <button
                      className="button"
                      disabled={
                        busy ||
                        experience.scenes.every(
                          (s) => s.status === 'approved' || s.status === 'generating',
                        )
                      }
                      onClick={() =>
                        void run(async () => {
                          for (const item of experience.scenes.filter(
                            (s) => s.status !== 'approved' && s.status !== 'generating',
                          ))
                            await generate(item);
                          setNotice(msg('m52991999ac'));
                        })
                      }
                    >
                      <WandSparkles size={16} />
                      {msg('m4b37633aa3')}
                    </button>
                  </div>
                  <MobileGallery
                    key={experience.id}
                    className="scene-grid"
                    label={msg('me1bc9251ce')}
                  >
                    {experience.scenes.map((item, i) => {
                      const currentAssets = item.assets.filter(
                        (asset) => asset.bibleVersion === experience.bibleVersion,
                      );
                      const cover =
                        currentAssets.find((a) => a.id === item.approvedAssetId) ??
                        currentAssets.at(photoPreset ? -1 : -2);
                      const job = jobs.find((j) => j.sceneId === item.id);
                      return (
                        <article
                          className={`scene-card ${item.status}`}
                          key={item.id}
                          data-feedback-id={`scene-${item.id}`}
                        >
                          <button
                            className="scene-image-button"
                            onClick={() => openScene(item)}
                            aria-label={msg('m82e982f8e8', { v0: item.title })}
                          >
                            {/* Bundled photo presets and labeled illustration fallbacks work offline. */}
                            <img
                              src={cover?.image ?? demoPreview(experience, item)}
                              alt={msg('m1486f9f1a7', {
                                v0: photoPreset ? msg('mf98858380a') : msg('mdb8257bad8'),
                                v1: item.title,
                                v2: experience.destination,
                              })}
                              width={600}
                              height={800}
                            />
                            <span className="scene-number">
                              {format.number(i + 1, { minimumIntegerDigits: 2 })}
                            </span>
                            <span className={`scene-badge ${item.status}`}>
                              {item.status === 'approved' && <Check size={12} />}{' '}
                              {msg(`status_${item.status}`)}
                            </span>
                            {item.status === 'draft' && (
                              <span className="draft-overlay">
                                <span className="draft-icon">
                                  <Sparkles size={28} />
                                </span>
                                <strong>
                                  {msg('m13f4e56575')}
                                  <br />
                                  {msg('m34494a6d67')}
                                </strong>
                                <span>{msg('m499d9d4c42')}</span>
                              </span>
                            )}
                            {item.status === 'generating' && (
                              <span className="draft-overlay generating-overlay">
                                <Loader2 className="spin" size={32} />
                                <strong>{msg('mace3708c50')}</strong>
                                <span>
                                  {scenario === 'slow' ? msg('mfb9bdd0ad9') : msg('m886bf448cb')}
                                </span>
                              </span>
                            )}
                            {item.status === 'stale' && (
                              <span className="stale-overlay">
                                {msg('m35560f855e')}
                                <br />
                                {msg('mc3129be234')}
                              </span>
                            )}
                            <span className="scene-time">
                              {item.time}{' '}
                              <span>
                                {msg('m94e09bb704')}
                                {demo(experience.destination)}
                              </span>
                            </span>
                          </button>
                          <div className="scene-caption">
                            <h4 dir="auto">{item.title}</h4>
                            <p>{item.shot}</p>
                            <div className="scene-actions">
                              <span>{msg('candidateCount', { count: currentAssets.length })}</span>
                              {job ? (
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      await api(`jobs/${job.id}/cancel`, 'POST', {});
                                    })
                                  }
                                >
                                  {msg('m77dfd2135f')}
                                  <X size={13} />
                                </button>
                              ) : (
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    ['draft', 'stale', 'failed'].includes(item.status)
                                      ? void run(async () => generate(item))
                                      : openScene(item)
                                  }
                                >
                                  {item.status === 'approved'
                                    ? msg('m4254ee3b40')
                                    : item.status === 'review'
                                      ? msg('m94c39e1df2')
                                      : msg('mfc45f9b7a9')}
                                  {['draft', 'stale', 'failed'].includes(item.status) ? (
                                    <Sparkles size={14} />
                                  ) : (
                                    <ArrowRight size={14} />
                                  )}
                                </button>
                              )}
                            </div>
                            <button
                              className="scene-compose-button"
                              aria-label={msg('m054d3d2e94', { v0: item.title })}
                              onClick={() => {
                                setSocialSceneId(item.id);
                                setPostView('write');
                                setTab('social');
                                requestAnimationFrame(() =>
                                  document
                                    .getElementById('panel-social')
                                    ?.scrollIntoView({ block: 'start' }),
                                );
                              }}
                            >
                              <Layers3 size={18} /> {msg('ma7cb26984a')}
                              <ArrowRight size={16} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </MobileGallery>
                  <div className="board-footer">
                    <span>
                      <span className="mock-dot" />
                      {photoPreset ? msg('m22a1472bf3') : msg('mb341c1802c')}
                    </span>
                    <span>{msg('m7ebada6bee')}</span>
                  </div>
                </section>
              )}
              <section
                hidden={tab !== 'social'}
                role="tabpanel"
                id="panel-social"
                aria-labelledby="tab-social"
                data-post-view={postView}
              >
                <div className="mobile-post-views" role="group" aria-label={msg('m495b2d1016')}>
                  {(
                    [
                      ['write', msg('m79c92c107a')],
                      ['preview', msg('mf1fbb2b43d')],
                      ['carousel', msg('mf1f842e195')],
                      ['caption', msg('m0dc93d0d2e')],
                    ] as const
                  ).map(([view, label]) => (
                    <button
                      key={view}
                      type="button"
                      aria-pressed={postView === view}
                      onClick={() => setPostView(view)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <SocialComposer
                  key={`${experience.id}:${experience.bibleVersion}:${workspaceReset}`}
                  experience={experience}
                  cover={
                    packCover?.experienceId === experience.id
                      ? packCover
                      : { sceneId: experience.pack.order[0], title: experience.pack.coverTitle }
                  }
                  selectedSceneId={socialSceneId}
                  onSelectScene={setSocialSceneId}
                  onDirtyChange={setSocialDirty}
                  onSave={async (id, input) => {
                    const result = await api<SceneSocial>(
                      `experiences/${experience.id}/scenes/${id}/social`,
                      'PATCH',
                      input,
                    );
                    await refresh();
                    return result;
                  }}
                />
                <PackEditor
                  key={`${experience.id}:${workspaceReset}`}
                  experience={experience}
                  onDirtyChange={setPackDirty}
                  onCoverChange={setPackCover}
                  onSave={async (input) => {
                    const result = await api<SocialPack>(
                      `experiences/${experience.id}/pack`,
                      'PATCH',
                      input,
                    );
                    await refresh();
                    return result;
                  }}
                />
                <section className="pack-caption">
                  <h3>
                    {msg('m71890eecb0')}
                    <span>{msg('m0c6c4102d4')}</span>
                  </h3>
                  <p>{msg('me754da2872')}</p>
                  <label htmlFor="caption">{msg('m109d4e0b30')}</label>
                  <textarea
                    id="caption"
                    rows={6}
                    maxLength={2200}
                    value={caption}
                    onChange={(e) => {
                      setCaption(e.target.value);
                      setCaptionDirty(true);
                    }}
                  />
                  <div className="caption-actions">
                    <span>{msg('captionCount', { count: caption.length })}</span>
                    <button
                      className="button"
                      disabled={busy || !captionDirty}
                      onClick={() =>
                        void run(async () => {
                          await api(`experiences/${experience.id}/caption`, 'PATCH', { caption });
                          setCaptionDirty(false);
                          setNotice(msg('m3c83083a8c'));
                        })
                      }
                    >
                      {msg('m86885b74be')}
                    </button>
                  </div>
                  <p className="fine-print">{msg('m3e5d6a479e')}</p>
                </section>
              </section>
              {tab === 'motion' && (
                <section
                  role="tabpanel"
                  id="panel-motion"
                  aria-labelledby="tab-motion"
                  className="motion-panel"
                >
                  <span className="motion-icon">
                    <Film size={40} />
                  </span>
                  <p className="eyebrow">{msg('m689b855684')}</p>
                  <h3>{msg('m886c3eaa0b')}</h3>
                  <p>{msg('m3f5e58be94')}</p>
                  <div className="motion-steps">
                    <span>{msg('m9447c490ee')}</span>
                    <ChevronRight size={15} />
                    <span>{msg('m83f11a8034')}</span>
                    <ChevronRight size={15} />
                    <span>{msg('m12b09aac35')}</span>
                  </div>
                  <a
                    className="button"
                    href="https://github.com/coders-clan/wishscene/issues/13"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {msg('mb0b704fb69')}
                    <ArrowRight size={16} />
                  </a>
                </section>
              )}
              <section className="export-bar">
                <div className="export-icon">
                  <FolderHeart size={24} />
                </div>
                <div className="export-copy">
                  <h3>{msg('mcdb5eff098')}</h3>
                  <p>
                    {approved === 4 ? msg('m0d8b624b87') : msg('m4742996e91', { v0: approved })}
                  </p>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={msg('m7397c53ffc')}
                  aria-valuenow={approved}
                  aria-valuemin={0}
                  aria-valuemax={4}
                >
                  {experience.scenes.map((item) => (
                    <span className={item.status === 'approved' ? 'done' : ''} key={item.id} />
                  ))}
                </div>
                <button
                  className="button primary"
                  disabled={approved !== 4 || busy || captionDirty || socialDirty || packDirty}
                  onClick={() => void exportPack()}
                >
                  <ArrowDownToLine size={16} />
                  {busy ? msg('m13b7bfcac4') : msg('md2caaa08c1')}
                </button>
              </section>
              {captionDirty && <p className="fine-print">{msg('me4cd7f4f2a')}</p>}
              {socialDirty && <p className="fine-print">{msg('m6ef6d7ce07')}</p>}
              {packDirty && <p className="fine-print">{msg('mf235d0d7f4')}</p>}
              <footer className="page-footer">
                <span>
                  {msg('mff43274984')}
                  <span className="footer-spark">✳</span> {msg('m77f885d996')}
                </span>
                <a href="https://github.com/coders-clan/wishscene" target="_blank" rel="noreferrer">
                  {msg('macd6c58a87')}
                  <ArrowRight size={12} />
                </a>
              </footer>
            </>
          )}
        </main>
      </div>
      <nav className="mobile-app-nav" aria-label={t('mobileNavigation')}>
        <button
          aria-current={!modal && tab === 'storyboard' ? 'page' : undefined}
          onClick={() => mobileScreen('storyboard')}
        >
          <Clapperboard size={21} />
          <span>{t('studioShort')}</span>
        </button>
        <button aria-haspopup="dialog" onClick={() => setModal('library')}>
          <FolderHeart size={21} />
          <span>{t('experiences')}</span>
        </button>
        <button
          className="mobile-create"
          aria-label={t('newExperience')}
          aria-haspopup="dialog"
          onClick={() => setModal('new')}
        >
          <span className="mobile-create-icon">
            <Plus size={24} />
          </span>
          <span>{t('create')}</span>
        </button>
        <button
          aria-current={!modal && tab === 'social' ? 'page' : undefined}
          onClick={() => mobileScreen('social')}
        >
          <Layers3 size={21} />
          <span>{t('posts')}</span>
        </button>
        <button aria-haspopup="dialog" onClick={() => setModal('more')}>
          <MoreHorizontal size={22} />
          <span>{t('more')}</span>
        </button>
      </nav>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button aria-label={msg('mdc83cd8031')} onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {modal && (
        <ModalFrame
          key={modal}
          title={
            modal === 'new'
              ? msg('m92693f2a30')
              : modal === 'story'
                ? msg('mf2ce70b693')
                : modal === 'developer'
                  ? msg('m3ca85faa60')
                  : modal === 'identity'
                    ? msg('me89538f2bd')
                    : modal === 'library'
                      ? msg('m84e7e92835')
                      : modal === 'review'
                        ? (scene?.title ?? msg('m94c39e1df2'))
                        : modal === 'more'
                          ? msg('m68d409a09c')
                          : modal === 'account'
                            ? account
                              ? msg('m18d468fa41')
                              : msg('m67bb3e8466')
                            : msg('mfff0efb49a')
          }
          eyebrow={
            modal === 'review'
              ? msg('m2477ca6d81', {
                  v0: scene ? scene.ordinal + 1 : 0,
                  v1: experience?.bibleVersion ?? 1,
                })
              : modal === 'developer'
                ? msg('m63054fb6ef')
                : modal === 'identity'
                  ? msg('m508d10a3d2')
                  : modal === 'account'
                    ? msg('m5f51afdd46')
                    : msg('m71dcab04ff')
          }
          onClose={close}
          wide={modal === 'review' || modal === 'library'}
        >
          {modal === 'more' && (
            <div className="mobile-more-actions">
              <LanguageSwitcher />
              {installApp.available && (
                <button
                  onClick={() => {
                    close();
                    installApp.open();
                  }}
                >
                  <Download />
                  <span>
                    {msg('me5f79aa13b')}
                    <small>{msg('m566fedbd41')}</small>
                  </span>
                  <ChevronRight />
                </button>
              )}
              <button disabled={!workspace} onClick={() => setModal('account')}>
                <UserRound />
                <span>
                  {account ? t('account') : t('signIn')}
                  <small>{account ? account.email : msg('m8b54a9b26b')}</small>
                </span>
                <ChevronRight />
              </button>
              <button onClick={() => setModal('identity')}>
                <Layers3 />
                <span>
                  {t('identity')}
                  <small>{msg('m5189be4b1b')}</small>
                </span>
                <ChevronRight />
              </button>
              <a href="/feedback">
                <MessageSquarePlus />
                <span>
                  {t('feedback')}
                  <small>{msg('m57b2b40a04')}</small>
                </span>
                <ChevronRight />
              </a>
              <button
                onClick={() => {
                  setTab('motion');
                  close();
                  window.scrollTo({ top: 0 });
                }}
              >
                <Film />
                <span>
                  {msg('me040db2b7f')}
                  <small>{msg('m33005cded4')}</small>
                </span>
                <ChevronRight />
              </button>
              <button onClick={() => setModal('help')}>
                <CircleHelp />
                <span>
                  {t('tour')}
                  <small>{msg('m4bdcf5226d')}</small>
                </span>
                <ChevronRight />
              </button>
              <button onClick={() => setModal('developer')}>
                <Code2 />
                <span>
                  {t('developer')}
                  <small>{msg('m332ed9ee55')}</small>
                </span>
                <ChevronRight />
              </button>
            </div>
          )}
          {error && (
            <p className="modal-error" role="alert">
              {error}
            </p>
          )}
          {modal === 'new' && (
            <form
              onChange={() => setFormDirty(true)}
              onSubmit={submitExperience}
              className="form-stack"
            >
              <p>{msg('m7c2eb2dbb5')}</p>
              <label>
                {msg('m092955fe30')}
                <input
                  name="title"
                  minLength={3}
                  maxLength={64}
                  required
                  placeholder={msg('m975f8109ed')}
                  autoFocus
                />
              </label>
              <label>
                <span id="destination-label">{msg('md42713493c')}</span>
                <select
                  name="destination"
                  aria-labelledby="destination-label"
                  value={newDestination}
                  onChange={(event) =>
                    setNewDestination(event.target.value as ExperienceInput['destination'])
                  }
                >
                  {destinations.map((x) => (
                    <option key={x} value={x}>
                      {demo(x)}
                    </option>
                  ))}
                </select>
              </label>
              <DemoLookFields key={newDestination} destination={newDestination} />
              <button className="button primary" disabled={busy}>
                {msg('mde75da8950')}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
          {modal === 'story' && experience && (
            <form onChange={() => setFormDirty(true)} className="form-stack" onSubmit={submitStory}>
              <p>{msg('m88c36f173d')}</p>
              <DemoLookFields
                key={`${experience.id}-${experience.bibleVersion}`}
                destination={experience.destination}
                initial={experience}
              />
              <div className="info-box">
                <BookOpen size={19} />
                <p>{msg('storyReset', { version: experience.bibleVersion })}</p>
              </div>
              <button className="button primary" disabled={busy}>
                {msg('m7f618b6be1')}
                <Check size={16} />
              </button>
            </form>
          )}
          {modal === 'library' && (
            <MobileGallery className="library-grid" label={msg('m3ebd907945')}>
              {workspace?.experiences.map((item) => (
                <button
                  className="library-card"
                  key={item.id}
                  onClick={() => selectExperience(item.id)}
                >
                  <img
                    src={demoPreview(item, item.scenes[0])}
                    alt={msg('m4a15552761', { v0: item.destination })}
                    width={600}
                    height={800}
                  />
                  <div>
                    <h3>{item.title}</h3>
                    <span>
                      {item.destination} {msg('m07a5491e03')}
                    </span>
                  </div>
                  <ArrowRight size={18} />
                </button>
              ))}
              <button className="library-new" onClick={() => setModal('new')}>
                <Plus size={24} />
                {msg('m879c9bff47')}
              </button>
            </MobileGallery>
          )}
          {modal === 'identity' && (
            <div className="identity-content">
              <div className="identity-portrait">
                <img
                  src="/demo/photos/tokyo-neon.jpg"
                  alt={msg('m2b91f16a27')}
                  width={600}
                  height={800}
                />
              </div>
              <h3>{msg('mab9944bc64')}</h3>
              <p>{msg('mf626e6363d')}</p>
              <div className="info-box">
                <Layers3 size={22} />
                <p>{msg('m6c630a4ccb')}</p>
              </div>
              <a
                className="button"
                href="https://github.com/coders-clan/wishscene/issues/6"
                target="_blank"
                rel="noreferrer"
              >
                {msg('m9fa329157f')}
                <ArrowRight size={16} />
              </a>
            </div>
          )}
          {modal === 'developer' && (
            <div className="form-stack">
              <p>{msg('m72f4704699')}</p>
              <label>
                {msg('m7f43611672')}
                <select
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value as GenerationInput['scenario'])}
                >
                  <option value="success">{msg('mb4a277874a')}</option>
                  <option value="slow">{msg('m3a6704cd82')}</option>
                  <option value="failure">{msg('m039fb5a350')}</option>
                </select>
              </label>
              <div className="developer-facts">
                <span>
                  {msg('m7ceee3f361')}
                  <strong>{msg('m4071dd31a2')}</strong>
                </span>
                <span>
                  {msg('m61074f1c95')}
                  <strong>{msg('mbbbabfd4dd')}</strong>
                </span>
                <span>
                  {msg('m5e490062f6')}
                  <strong>$0</strong>
                </span>
                <span>
                  {msg('m2da600bf94')}
                  <strong>{msg('md371e089ea')}</strong>
                </span>
              </div>
              <button
                className="button"
                onClick={() =>
                  void run(async () => {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/api/v1/workspace`,
                    );
                    setNotice(msg('me1988dd2e1'));
                  })
                }
              >
                <Copy size={15} />
                {msg('mba73f11cbb')}
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api('mock/reset', 'POST', {});
                    setExperienceId('tokyo-after-hours');
                    setScenario('success');
                    setCaptionDirty(false);
                    setSocialDirty(false);
                    setWorkspaceReset((value) => value + 1);
                    close();
                    setNotice(msg('m11a08ec2e4'));
                  })
                }
              >
                <RotateCcw size={15} />
                {msg('m774f712256')}
              </button>
              <p className="fine-print">{msg('m9c21c1853c')}</p>
            </div>
          )}
          {modal === 'account' && workspace && (
            <DemoSignIn
              auth={workspace.demoAuth}
              busy={busy}
              onRequest={(email) => void demoAuth('magic-link', { email }, msg('mfe6d5b7f6b'))}
              onVerify={(token) => void demoAuth('verify', { token }, msg('m16e3dbfc1e'))}
              onSignOut={() => void demoAuth('sign-out', {}, msg('m0cc3919878'))}
            />
          )}
          {modal === 'help' && (
            <div className="tour-list">
              {[
                [msg('m7ec1f99361'), msg('m3f52a6c01d')],
                [msg('m354351ff99'), msg('m51bed76eb0')],
                [msg('mb2d8c8ae5c'), msg('mbbc9a6462e')],
                [msg('me41df9fa48'), msg('ma85e83130a')],
              ].map(([title, copy], i) => (
                <div key={title}>
                  <span>{format.number(i + 1, { minimumIntegerDigits: 2 })}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                </div>
              ))}
              <button className="button primary" onClick={close}>
                {msg('me3ff713a49')}
                <Sparkles size={16} />
              </button>
            </div>
          )}
          {modal === 'review' && scene && experience && (
            <div className="review-content">
              <p>
                {scene.shot} · {scene.time} · {experience.outfit}
              </p>
              {scene.status === 'failed' && <div className="modal-error">{msg('m5f95882d0d')}</div>}
              {scene.status === 'stale' && (
                <div className="info-box">
                  <BookOpen size={18} />
                  <p>{msg('m7806d12ccb')}</p>
                </div>
              )}
              <MobileGallery key={scene.id} className="candidate-grid" label={msg('m253e20f7ce')}>
                {scene.assets
                  .filter((a) => a.bibleVersion === experience.bibleVersion)
                  .slice(photoPreset ? -1 : -2)
                  .map((asset) => (
                    <div className="candidate" key={asset.id}>
                      <img
                        src={asset.image}
                        alt={
                          asset.media === 'photo'
                            ? msg('me0b26d2c87', { v0: scene.title })
                            : msg('m8a9081b0e1', {
                                v0: asset.variant ? msg('m63e49827e4') : msg('mc0a8060f3b'),
                                v1: scene.title,
                              })
                        }
                        width={600}
                        height={800}
                      />
                      <div>
                        <span>
                          {asset.media === 'photo'
                            ? msg('m85893569d8')
                            : asset.variant
                              ? msg('mc0c255591e')
                              : msg('m90c6bba167')}
                        </span>
                        <button
                          className={`button ${scene.approvedAssetId === asset.id ? 'approved-button' : 'primary'}`}
                          disabled={busy || scene.status === 'generating'}
                          onClick={() => void approve(scene, asset)}
                        >
                          <Check size={15} />
                          {scene.approvedAssetId === asset.id
                            ? msg('m41b81eb8db')
                            : msg('m7b2c7f146a')}
                        </button>
                      </div>
                    </div>
                  ))}
              </MobileGallery>
              {!scene.assets.some((a) => a.bibleVersion === experience.bibleVersion) && (
                <div className="empty-candidates">
                  <Sparkles size={35} />
                  <h3>{scene.status === 'generating' ? msg('m54f4fe1c4b') : msg('md9e69bdaf3')}</h3>
                  <p>{photoPreset ? msg('m273b3068f1') : msg('m3648936665')}</p>
                </div>
              )}
              <div className="review-footer">
                <span className="fine-print">
                  {photoPreset ? msg('m12341f4cc0') : msg('mbbb30eda79')}
                </span>
                <button
                  className="button"
                  disabled={busy || scene.status === 'generating'}
                  onClick={() => void run(async () => generate(scene))}
                >
                  <WandSparkles size={15} />
                  {scene.status === 'generating' ? msg('m11edad70c1') : msg('m2e49a7530b')}
                </button>
              </div>
            </div>
          )}
        </ModalFrame>
      )}
    </div>
  );
}
