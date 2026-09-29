'use client';

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
import { DemoSignIn } from './demo-sign-in';

async function api<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    cache: 'no-store',
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message ?? 'Something went wrong. Try again.');
  return value;
}
const moods: ExperienceInput['mood'][] = ['After hours', 'Slow living', 'Golden hour', 'Adventure'];
const destinations: ExperienceInput['destination'][] = ['Tokyo', 'Kyoto', 'Amalfi', 'Iceland'];
const statusLabels = {
  approved: 'Approved',
  review: 'Ready to review',
  draft: 'Ready to create',
  generating: 'Creating your scene',
  failed: 'Try again',
  stale: 'Story updated',
};
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
  const preset = demoPresets[destination];
  const [outfit, setOutfit] = useState(initial?.outfit ?? preset.outfit);
  const [mood, setMood] = useState<ExperienceInput['mood']>(initial?.mood ?? preset.mood);
  const matched = hasPhotoPreset({ destination, outfit, mood });
  return (
    <>
      <label>
        Your look
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
        The feeling
        <select
          name="mood"
          value={mood}
          onChange={(event) => setMood(event.target.value as ExperienceInput['mood'])}
        >
          {moods.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <div className="preset-note" aria-live="polite">
        <strong>{matched ? 'Photo preset matched' : 'Custom developer settings'}</strong>
        <p>
          {matched
            ? `Four pre-generated ${destination} photos share this look and the same fictional man. Regenerating reuses these photos.`
            : 'Custom settings use illustrated placeholders; they do not change the person’s clothes or lighting. Live AI generation is a future feature.'}
        </p>
        {!matched && (
          <button
            type="button"
            className="button"
            onClick={() => {
              setOutfit(preset.outfit);
              setMood(preset.mood);
            }}
          >
            Use {destination} photo preset
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
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export default function Studio() {
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
    void refresh().catch((e) => setError(e.message));
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  const hasJobs = workspace?.jobs.some((job) => activeJob(job.status));
  useEffect(() => {
    if (!hasJobs) return;
    const timer = setInterval(() => {
      void refresh().catch((e) => setError(e.message));
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
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const close = () => setModal(null);
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
      setNotice('Scene approved. Looking good.');
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
      zip.file(
        'README.txt',
        `${manifest.provenance}\n\nThese are bundled demo fixtures, not newly generated images.\nimages/ holds one post-ready JPEG per scene in carousel order (01 is the cover), cropped to its platform format at the pixel size recorded in manifest.json, with an AI-created label drawn on the image.\noriginals/ holds the unedited approved fixtures.\nposts/ holds each image's caption. Nothing was published to a social account.\n`,
      );
      await Promise.all(
        manifest.assets.map(async (asset) => {
          const response = await fetch(asset.image);
          if (!response.ok) throw new Error('Could not fetch a demo image.');
          zip.file(asset.filename, await response.arrayBuffer());
          zip.file(asset.output.filename, await renderPostImage(asset, manifest.coverTitle));
          const { output, social } = asset;
          const stem = output.filename.slice(output.filename.lastIndexOf('/') + 1, -'.jpg'.length);
          zip.file(
            `posts/${stem}.txt`,
            `${socialPlatforms[social.platform].label}\nScene: ${asset.title}\nImage: ${output.filename} (${output.width}×${output.height}, ${output.aspectRatio})\n\n${social.caption}\n\n${socialPlatforms[social.platform].vertical && social.overlayText ? `Text on image: ${social.overlayText}\n` : ''}AI-created fictional scene.\n`,
          );
        }),
      );
      const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `wishscene-${manifest.destination.toLowerCase()}-demo.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Your demo image pack is ready.');
    });
  const submitExperience = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (socialDirty || packDirty) {
      setError('Save your post drafts and carousel before creating an experience.');
      return;
    }
    const data = new FormData(e.currentTarget);
    void run(async () => {
      const created = await api<Experience>('experiences', 'POST', Object.fromEntries(data));
      setExperienceId(created.id);
      setTab('storyboard');
      close();
      setNotice('A new story, waiting to happen.');
    });
  };
  const submitStory = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (socialDirty) {
      setError('Save your post drafts before changing the story.');
      return;
    }
    const data = new FormData(e.currentTarget);
    void run(async () => {
      await api(`experiences/${experience!.id}/story`, 'PATCH', {
        ...Object.fromEntries(data),
        expectedVersion: experience!.bibleVersion,
      });
      close();
      setNotice('Story saved. Changed scenes are ready to regenerate.');
    });
  };
  const selectExperience = (id: string) => {
    if ((socialDirty || packDirty) && id !== experienceId) {
      setError('Save your post drafts and carousel before switching experiences.');
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
        Skip to studio
      </a>
      <aside className="sidebar">
        <a href="/" className="wordmark" aria-label="wishscene home">
          <span className="brand-icon">
            <Sparkles size={21} />
          </span>
          wishscene<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR CREATIVE SPACE</div>
        <nav aria-label="Main navigation">
          <a className="nav-item" href="/feedback">
            Team feedback
          </a>
          <button
            className="nav-item active"
            onClick={() => {
              setTab('storyboard');
              close();
            }}
          >
            <Clapperboard />
            My studio
            <span className="nav-dot" />
          </button>
          <button className="nav-item" onClick={() => setModal('library')}>
            <FolderHeart />
            Experiences<span className="nav-count">{workspace?.experiences.length ?? 3}</span>
          </button>
          <button className="nav-item" onClick={() => setModal('identity')}>
            <Layers3 />
            Your identity
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="small-spark">✳</span>
          <h3>
            A little imagination.
            <br />A whole new world.
          </h3>
          <p>Start with a place you wish you could be.</p>
          <button onClick={() => setModal('new')}>
            Make a new scene <ArrowRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setModal('developer')}>
            <Code2 />
            Developer tools
          </button>
          <button className="nav-item" onClick={() => setModal('help')}>
            <CircleHelp />A quick tour
          </button>
          <div className="profile">
            <span className="avatar">A</span>
            <div>
              <strong>Alex Morgan</strong>
              <span>{account?.email ?? 'Demo workspace'}</span>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <a className="mobile-brand" href="/" aria-label="wishscene home">
            <Sparkles size={20} /> wishscene<span>.</span>
          </a>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>My studio</strong>
          </div>
          <div className="topbar-actions">
            <button className="button primary" onClick={() => setModal('new')}>
              <Plus size={18} />
              New experience
            </button>
            <button
              className="demo-pill account-pill"
              aria-haspopup="dialog"
              aria-label={account ? `Signed in as ${account.email}` : 'Sign in'}
              disabled={!workspace}
              onClick={() => setModal('account')}
            >
              <UserRound size={14} />
              {account ? <b className="account-email">{account.email}</b> : 'Sign in'}
            </button>
            <button className="demo-pill" onClick={() => setModal('developer')}>
              <span />
              Mock mode <Code2 size={14} />
            </button>
          </div>
        </header>
        <main id="main">
          <section className="greeting" data-feedback-id="studio-greeting">
            <div>
              <p className="eyebrow">
                <span className="violet-star">✳</span> A WORLD OF WHAT IF
              </p>
              <h1>
                Your imagination, <em>in frame.</em>
              </h1>
              <p>Turn a somewhere into your kind of story.</p>
            </div>
          </section>
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button onClick={() => setError('')} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {!experience ? (
            <section className="loading-state">
              <Sparkles size={40} />
              <h2>{error ? 'Let’s reconnect your studio.' : 'Setting the scene…'}</h2>
              <p>Your demo workspace is loading.</p>
              {error && (
                <button
                  className="button"
                  onClick={() => void refresh().catch((e) => setError(e.message))}
                >
                  Retry
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
                      <h2>{experience.title}</h2>
                      <ChevronDown size={19} />
                    </button>
                    <p>
                      <MapPin size={12} />
                      {experience.destination} <span>·</span>4 scenes <span>·</span>Fictional
                      experience
                    </p>
                  </div>
                </div>
                <button className="button subtle" onClick={() => setModal('story')}>
                  <Settings2 size={16} />
                  Story settings
                </button>
              </section>
              <div
                className={`story-strip ${storyExpanded ? 'is-expanded' : ''}`}
                data-feedback-id="story-settings"
              >
                <button
                  className="story-title"
                  aria-label="Story details"
                  aria-expanded={storyExpanded}
                  onClick={() => setStoryExpanded((value) => !value)}
                >
                  <BookOpen size={17} />
                  <strong>Story Bible</strong>
                  <span className="version">v{experience.bibleVersion}</span>
                  <ChevronDown size={16} className="mobile-story-chevron" />
                </button>
                <div className="story-detail">
                  <span>CAST</span>
                  <strong>Alex Morgan</strong>
                </div>
                <div className="story-detail outfit">
                  <span>LOOK</span>
                  <strong>{experience.outfit}</strong>
                </div>
                <div className="story-detail">
                  <span>FEEL</span>
                  <strong>{experience.mood}</strong>
                </div>
                <span className="story-consistency">
                  <Check size={14} />
                  One story, all scenes
                </span>
              </div>
              <div className={`demo-photo-note ${photoPreset ? '' : 'custom'}`}>
                <ImageIcon size={15} />
                <span>
                  {photoPreset
                    ? 'Photo preset · Same fictional Alex, matching look · Pre-generated AI images'
                    : 'Custom settings · Illustrated placeholders do not render your outfit or mood'}
                </span>
                {!photoPreset && (
                  <button type="button" onClick={() => setModal('story')}>
                    Choose photo preset
                  </button>
                )}
              </div>
              <div className="section-tabs">
                <div
                  role="tablist"
                  aria-label="Experience output"
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
                    Storyboard<span>04</span>
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
                    Social pack
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
                    Motion<span className="soon">NEXT</span>
                  </button>
                </div>
                <span className="saved-state">
                  <span />
                  In this demo session
                </span>
              </div>
              {tab === 'storyboard' && (
                <section role="tabpanel" id="panel-storyboard" aria-labelledby="tab-storyboard">
                  <div className="board-heading">
                    <div>
                      <h3>Four moments. One story.</h3>
                      <p>Make each scene yours, then bring it all together.</p>
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
                          setNotice('Your scenes are on their way.');
                        })
                      }
                    >
                      <WandSparkles size={16} />
                      Generate remaining
                    </button>
                  </div>
                  <MobileGallery key={experience.id} className="scene-grid" label="Scene gallery">
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
                            aria-label={`Review ${item.title}`}
                          >
                            {/* Bundled photo presets and labeled illustration fallbacks work offline. */}
                            <img
                              src={cover?.image ?? demoPreview(experience, item)}
                              alt={`${photoPreset ? 'AI-created photo of fictional Alex' : 'Illustrated placeholder'}: ${item.title} in ${experience.destination}`}
                              width={600}
                              height={800}
                            />
                            <span className="scene-number">0{i + 1}</span>
                            <span className={`scene-badge ${item.status}`}>
                              {item.status === 'approved' && <Check size={12} />}{' '}
                              {statusLabels[item.status]}
                            </span>
                            {item.status === 'draft' && (
                              <span className="draft-overlay">
                                <span className="draft-icon">
                                  <Sparkles size={28} />
                                </span>
                                <strong>
                                  A moment waiting
                                  <br />
                                  to happen.
                                </strong>
                                <span>Make the scene yours</span>
                              </span>
                            )}
                            {item.status === 'generating' && (
                              <span className="draft-overlay generating-overlay">
                                <Loader2 className="spin" size={32} />
                                <strong>Setting the scene…</strong>
                                <span>
                                  {scenario === 'slow'
                                    ? 'Taking the scenic route'
                                    : 'A little imagination at work'}
                                </span>
                              </span>
                            )}
                            {item.status === 'stale' && (
                              <span className="stale-overlay">
                                Your story changed.
                                <br />
                                Let’s make it match.
                              </span>
                            )}
                            <span className="scene-time">
                              {item.time}{' '}
                              <span>JOURNAL / {experience.destination.toUpperCase()}</span>
                            </span>
                          </button>
                          <div className="scene-caption">
                            <h4>{item.title}</h4>
                            <p>{item.shot}</p>
                            <div className="scene-actions">
                              <span>
                                {currentAssets.length}{' '}
                                {currentAssets.length === 1 ? 'candidate' : 'candidates'}
                              </span>
                              {job ? (
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      await api(`jobs/${job.id}/cancel`, 'POST', {});
                                    })
                                  }
                                >
                                  Cancel <X size={13} />
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
                                    ? 'View scene'
                                    : item.status === 'review'
                                      ? 'Review scene'
                                      : 'Generate'}
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
                              aria-label={`Create post for ${item.title}`}
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
                              <Layers3 size={18} /> Create post <ArrowRight size={16} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </MobileGallery>
                  <div className="board-footer">
                    <span>
                      <span className="mock-dot" />
                      {photoPreset
                        ? 'Pre-generated photo presets · no live AI calls'
                        : 'Illustrated developer fixtures · custom settings are not rendered'}
                    </span>
                    <span>Made for your imagination.</span>
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
                <div className="mobile-post-views" role="group" aria-label="Post view">
                  {(
                    [
                      ['write', 'Write post'],
                      ['preview', 'Preview'],
                      ['carousel', 'Carousel'],
                      ['caption', 'Pack caption'],
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
                    Whole-pack caption <span>Optional</span>
                  </h3>
                  <p>
                    One extra caption for the complete story. Your per-image posts keep their own
                    text.
                  </p>
                  <label htmlFor="caption">Your caption</label>
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
                    <span>{caption.length}/2200</span>
                    <button
                      className="button"
                      disabled={busy || !captionDirty}
                      onClick={() =>
                        void run(async () => {
                          await api(`experiences/${experience.id}/caption`, 'PATCH', { caption });
                          setCaptionDirty(false);
                          setNotice('Caption saved.');
                        })
                      }
                    >
                      Save caption
                    </button>
                  </div>
                  <p className="fine-print">
                    The ZIP includes a post-ready crop of each image in carousel order, the
                    originals, per-image post text, this caption, and a provenance manifest with
                    exact image sizes. Direct posting is future work.
                  </p>
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
                  <p className="eyebrow">THE NEXT CHAPTER</p>
                  <h3>Same story. A little more motion.</h3>
                  <p>
                    Short clips and a reel editor are planned for phase two. First, get the
                    character and story right in your approved stills.
                  </p>
                  <div className="motion-steps">
                    <span>01 · Approved keyframes</span>
                    <ChevronRight size={15} />
                    <span>02 · Short clips</span>
                    <ChevronRight size={15} />
                    <span>03 · Your reel</span>
                  </div>
                  <a
                    className="button"
                    href="https://github.com/coders-clan/wishscene/issues/13"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Follow the video work <ArrowRight size={16} />
                  </a>
                </section>
              )}
              <section className="export-bar">
                <div className="export-icon">
                  <FolderHeart size={24} />
                </div>
                <div className="export-copy">
                  <h3>Your story, ready to go.</h3>
                  <p>
                    {approved === 4
                      ? 'All scenes approved. Your demo pack is ready.'
                      : `${approved} of 4 scenes approved. A few more moments to make.`}
                  </p>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Approved scenes"
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
                  {busy ? 'Working…' : 'Export demo pack'}
                </button>
              </section>
              {captionDirty && <p className="fine-print">Save your caption before exporting.</p>}
              {socialDirty && (
                <p className="fine-print">Save your per-image post drafts before exporting.</p>
              )}
              {packDirty && <p className="fine-print">Save your carousel before exporting.</p>}
              <footer className="page-footer">
                <span>
                  wishscene <span className="footer-spark">✳</span> Imagine it. Make the scene.
                </span>
                <a href="https://github.com/coders-clan/wishscene" target="_blank" rel="noreferrer">
                  Built by Coders Clan <ArrowRight size={12} />
                </a>
              </footer>
            </>
          )}
        </main>
      </div>
      <nav className="mobile-app-nav" aria-label="Mobile navigation">
        <button
          aria-current={!modal && tab === 'storyboard' ? 'page' : undefined}
          onClick={() => mobileScreen('storyboard')}
        >
          <Clapperboard size={21} />
          <span>Studio</span>
        </button>
        <button aria-haspopup="dialog" onClick={() => setModal('library')}>
          <FolderHeart size={21} />
          <span>Experiences</span>
        </button>
        <button
          className="mobile-create"
          aria-label="New experience"
          aria-haspopup="dialog"
          onClick={() => setModal('new')}
        >
          <span className="mobile-create-icon">
            <Plus size={24} />
          </span>
          <span>Create</span>
        </button>
        <button
          aria-current={!modal && tab === 'social' ? 'page' : undefined}
          onClick={() => mobileScreen('social')}
        >
          <Layers3 size={21} />
          <span>Posts</span>
        </button>
        <button aria-haspopup="dialog" onClick={() => setModal('more')}>
          <MoreHorizontal size={22} />
          <span>More</span>
        </button>
      </nav>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {modal && (
        <ModalFrame
          key={modal}
          title={
            modal === 'new'
              ? 'Where do you wish you were?'
              : modal === 'story'
                ? 'The details make the story.'
                : modal === 'developer'
                  ? 'Make the mock work for you.'
                  : modal === 'identity'
                    ? 'Meet your demo character.'
                    : modal === 'library'
                      ? 'A collection of what ifs.'
                      : modal === 'review'
                        ? (scene?.title ?? 'Review scene')
                        : modal === 'more'
                          ? 'Your workspace'
                          : modal === 'account'
                            ? account
                              ? 'You’re signed in.'
                              : 'Sign in with a magic link.'
                            : 'A little tour of wishscene.'
          }
          eyebrow={
            modal === 'review'
              ? `SCENE ${scene ? scene.ordinal + 1 : ''} · STORY V${experience?.bibleVersion}`
              : modal === 'developer'
                ? 'DEVELOPER SANDBOX'
                : modal === 'identity'
                  ? 'YOUR IDENTITY'
                  : modal === 'account'
                    ? 'DEMO SIGN-IN'
                    : 'WISHSCENE STUDIO'
          }
          onClose={close}
          wide={modal === 'review' || modal === 'library'}
        >
          {modal === 'more' && (
            <div className="mobile-more-actions">
              {installApp.available && (
                <button
                  onClick={() => {
                    close();
                    installApp.open();
                  }}
                >
                  <Download />
                  <span>
                    Install app<small>Add wishscene to your home screen</small>
                  </span>
                  <ChevronRight />
                </button>
              )}
              <button disabled={!workspace} onClick={() => setModal('account')}>
                <UserRound />
                <span>
                  {account ? 'Account' : 'Sign in'}
                  <small>{account ? account.email : 'Try the magic-link sign-in'}</small>
                </span>
                <ChevronRight />
              </button>
              <button onClick={() => setModal('identity')}>
                <Layers3 />
                <span>
                  Your identity<small>Meet the demo character</small>
                </span>
                <ChevronRight />
              </button>
              <a href="/feedback">
                <MessageSquarePlus />
                <span>
                  Team feedback<small>Read reports, reply, and vote</small>
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
                  Motion<small>Preview what’s coming next</small>
                </span>
                <ChevronRight />
              </button>
              <button onClick={() => setModal('help')}>
                <CircleHelp />
                <span>
                  A quick tour<small>How to create your story</small>
                </span>
                <ChevronRight />
              </button>
              <button onClick={() => setModal('developer')}>
                <Code2 />
                <span>
                  Developer tools<small>Mock scenarios and workspace reset</small>
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
            <form onSubmit={submitExperience} className="form-stack">
              <p>
                Choose a destination to load four realistic photos of the same fictional Alex. Each
                destination has a matching outfit and mood preset.
              </p>
              <label>
                Experience name
                <input
                  name="title"
                  minLength={3}
                  maxLength={64}
                  required
                  placeholder="A weekend in another world"
                  autoFocus
                />
              </label>
              <label>
                <span id="destination-label">Destination</span>
                <select
                  name="destination"
                  aria-labelledby="destination-label"
                  value={newDestination}
                  onChange={(event) =>
                    setNewDestination(event.target.value as ExperienceInput['destination'])
                  }
                >
                  {destinations.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <DemoLookFields key={newDestination} destination={newDestination} />
              <button className="button primary" disabled={busy}>
                Create experience <ArrowRight size={16} />
              </button>
            </form>
          )}
          {modal === 'story' && experience && (
            <form className="form-stack" onSubmit={submitStory}>
              <p>
                These details stay shared across every scene. Changing them creates a new story
                version and clears previous approvals.
              </p>
              <DemoLookFields
                key={`${experience.id}-${experience.bibleVersion}`}
                destination={experience.destination}
                initial={experience}
              />
              <div className="info-box">
                <BookOpen size={19} />
                <p>
                  Story v{experience.bibleVersion} · Your previous candidates are kept. Active jobs
                  will be cancelled when the story changes.
                </p>
              </div>
              <button className="button primary" disabled={busy}>
                Save story <Check size={16} />
              </button>
            </form>
          )}
          {modal === 'library' && (
            <MobileGallery className="library-grid" label="Experience gallery">
              {workspace?.experiences.map((item) => (
                <button
                  className="library-card"
                  key={item.id}
                  onClick={() => selectExperience(item.id)}
                >
                  <img
                    src={demoPreview(item, item.scenes[0])}
                    alt={`Fictional Alex in ${item.destination}`}
                    width={600}
                    height={800}
                  />
                  <div>
                    <h3>{item.title}</h3>
                    <span>{item.destination} · 4 scenes</span>
                  </div>
                  <ArrowRight size={18} />
                </button>
              ))}
              <button className="library-new" onClick={() => setModal('new')}>
                <Plus size={24} />
                Make another wish
              </button>
            </MobileGallery>
          )}
          {modal === 'identity' && (
            <div className="identity-content">
              <div className="identity-portrait">
                <img
                  src="/demo/photos/tokyo-neon.jpg"
                  alt="AI-created portrait of fictional Alex, the reference character for the demo photos"
                  width={600}
                  height={800}
                />
              </div>
              <h3>Alex Morgan</h3>
              <p>
                One fictional man, four destinations. These 16 AI-created photos were made using the
                same character reference and bundled with the demo. Visual consistency was reviewed;
                automated likeness verification is not implemented.
              </p>
              <div className="info-box">
                <Layers3 size={22} />
                <p>
                  No personal photos are uploaded. Identity consent, private storage, and likeness
                  verification belong to the next implementation phase.
                </p>
              </div>
              <a
                className="button"
                href="https://github.com/coders-clan/wishscene/issues/6"
                target="_blank"
                rel="noreferrer"
              >
                Explore identity onboarding <ArrowRight size={16} />
              </a>
            </div>
          )}
          {modal === 'developer' && (
            <div className="form-stack">
              <p>
                Exercise the real interface with a simulated provider. Your workspace lives in this
                server process and expires after an hour without activity.
              </p>
              <label>
                Generation scenario
                <select
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value as GenerationInput['scenario'])}
                >
                  <option value="success">Success · about 2.4 seconds</option>
                  <option value="slow">Slow provider · about 12 seconds</option>
                  <option value="failure">Failure · retryable timeout</option>
                </select>
              </label>
              <div className="developer-facts">
                <span>
                  Provider <strong>Bundled photo presets + SVG fallbacks</strong>
                </span>
                <span>
                  Database <strong>Per-session memory</strong>
                </span>
                <span>
                  Real API spend <strong>$0</strong>
                </span>
                <span>
                  Version <strong>Scaffold 0.1</strong>
                </span>
              </div>
              <button
                className="button"
                onClick={() =>
                  void run(async () => {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/api/v1/workspace`,
                    );
                    setNotice('API URL copied.');
                  })
                }
              >
                <Copy size={15} />
                Copy workspace API URL
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
                    setNotice('Fresh canvas. Demo workspace reset.');
                  })
                }
              >
                <RotateCcw size={15} />
                Reset demo workspace
              </button>
              <p className="fine-print">
                Reset replaces only your synthetic demo state. No API keys, database, or Docker
                needed.
              </p>
            </div>
          )}
          {modal === 'account' && workspace && (
            <DemoSignIn
              auth={workspace.demoAuth}
              busy={busy}
              onRequest={(email) =>
                void demoAuth('magic-link', { email }, 'Sign-in link sent. Check the demo inbox.')
              }
              onVerify={(token) =>
                void demoAuth('verify', { token }, 'Signed in with your magic link.')
              }
              onSignOut={() => void demoAuth('sign-out', {}, 'Signed out of the demo.')}
            />
          )}
          {modal === 'help' && (
            <div className="tour-list">
              {[
                [
                  'Pick your somewhere',
                  'Start with Tokyo, try a sample experience, or create a new one.',
                ],
                [
                  'Make the moments',
                  'Load the photo preset for each scene and approve it. Custom developer settings use illustrated placeholders.',
                ],
                [
                  'Keep the story together',
                  'Edit the Story Bible to test versioning and regeneration.',
                ],
                [
                  'Take it with you',
                  'Approve all four scenes and export the photo pack with a caption and provenance manifest.',
                ],
              ].map(([title, copy], i) => (
                <div key={title}>
                  <span>0{i + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                </div>
              ))}
              <button className="button primary" onClick={close}>
                Let’s make a scene <Sparkles size={16} />
              </button>
            </div>
          )}
          {modal === 'review' && scene && experience && (
            <div className="review-content">
              <p>
                {scene.shot} · {scene.time} · {experience.outfit}
              </p>
              {scene.status === 'failed' && (
                <div className="modal-error">
                  Simulated provider timeout. Choose Success in Developer tools to retry.
                </div>
              )}
              {scene.status === 'stale' && (
                <div className="info-box">
                  <BookOpen size={18} />
                  <p>
                    These candidates belong to an earlier story. Generate new ones before approving.
                  </p>
                </div>
              )}
              <MobileGallery key={scene.id} className="candidate-grid" label="Image choices">
                {scene.assets
                  .filter((a) => a.bibleVersion === experience.bibleVersion)
                  .slice(photoPreset ? -1 : -2)
                  .map((asset) => (
                    <div className="candidate" key={asset.id}>
                      <img
                        src={asset.image}
                        alt={
                          asset.media === 'photo'
                            ? `AI-created photo of fictional Alex: ${scene.title}`
                            : `${asset.variant ? 'Warm' : 'Original'} illustrated candidate for ${scene.title}`
                        }
                        width={600}
                        height={800}
                      />
                      <div>
                        <span>
                          {asset.media === 'photo'
                            ? '01 · Photo preset'
                            : asset.variant
                              ? '02 · Warm illustration'
                              : '01 · Original illustration'}
                        </span>
                        <button
                          className={`button ${scene.approvedAssetId === asset.id ? 'approved-button' : 'primary'}`}
                          disabled={busy || scene.status === 'generating'}
                          onClick={() => void approve(scene, asset)}
                        >
                          <Check size={15} />
                          {scene.approvedAssetId === asset.id ? 'Approved' : 'Approve'}
                        </button>
                      </div>
                    </div>
                  ))}
              </MobileGallery>
              {!scene.assets.some((a) => a.bibleVersion === experience.bibleVersion) && (
                <div className="empty-candidates">
                  <Sparkles size={35} />
                  <h3>
                    {scene.status === 'generating'
                      ? 'Your scene is on its way.'
                      : 'A fresh scene starts here.'}
                  </h3>
                  <p>
                    {photoPreset
                      ? 'Load the pre-generated photo for this scene.'
                      : 'Generate two illustrated placeholders to test the review flow.'}
                  </p>
                </div>
              )}
              <div className="review-footer">
                <span className="fine-print">
                  {photoPreset
                    ? 'Fixed photo preset · regenerating returns the same photo'
                    : 'Illustrated placeholders · custom look not rendered'}
                </span>
                <button
                  className="button"
                  disabled={busy || scene.status === 'generating'}
                  onClick={() => void run(async () => generate(scene))}
                >
                  <WandSparkles size={15} />
                  {scene.status === 'generating' ? 'Generating…' : 'Generate candidates'}
                </button>
              </div>
            </div>
          )}
        </ModalFrame>
      )}
    </div>
  );
}
