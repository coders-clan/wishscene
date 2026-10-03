'use client';

import { useCopy } from '@/i18n/copy';
import { useEffect, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Bookmark,
  Check,
  Copy,
  Crop,
  Heart,
  MessageCircle,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  demoPreview,
  demoSourceSize,
  exportFrame,
  hasPhotoPreset,
  socialPlatformSchema,
  socialPlatforms,
  socialToneSchema,
  suggestSocialCopy,
  type Experience,
  type SceneSocial,
  type SocialDraft,
  type SocialFocus,
  type SocialPlatform,
  type SocialUpdate,
} from '@wishscene/contracts';
import { CropEditor } from './crop-editor';

const sameFocus = (a: SocialFocus, b: SocialFocus) =>
  a.x === b.x && a.y === b.y && a.zoom === b.zoom;

interface Props {
  experience: Experience;
  /** The carousel cover as the carousel editor shows it, unsaved edits included. */
  cover: { sceneId: string; title: string };
  selectedSceneId: string | null;
  onSelectScene: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (sceneId: string, input: SocialUpdate) => Promise<SceneSocial>;
}

export function SocialComposer({
  experience,
  cover,
  selectedSceneId,
  onSelectScene,
  onDirtyChange,
  onSave,
}: Props) {
  const msg = useCopy('studio');
  const [edits, setEdits] = useState<Record<string, SocialDraft>>({});
  const [focusEdits, setFocusEdits] = useState<Record<string, SocialFocus>>({});
  const [choices, setChoices] = useState<Record<string, SocialPlatform>>({});
  const [saved, setSaved] = useState<Record<string, SceneSocial>>({});
  const [editRevisions, setEditRevisions] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const scene =
    experience.scenes.find((item) => item.id === selectedSceneId) ?? experience.scenes[0];
  const baseFor = (id: string, current: SceneSocial) =>
    saved[id] && saved[id].revision > current.revision ? saved[id] : current;
  const social = baseFor(scene.id, scene.social);
  const platform = choices[scene.id] ?? social.platform;
  const preset = socialPlatforms[platform];
  const key = `${scene.id}:${platform}`;
  const draft = edits[key] ?? social.drafts[platform];
  const focus = focusEdits[scene.id] ?? social.focus;
  const changed =
    platform !== social.platform ||
    !sameFocus(focus, social.focus) ||
    JSON.stringify(draft) !== JSON.stringify(social.drafts[platform]);
  const isSceneDirty = (item: Experience['scenes'][number]) => {
    const base = baseFor(item.id, item.social);
    return (
      (choices[item.id] ?? base.platform) !== base.platform ||
      !sameFocus(focusEdits[item.id] ?? base.focus, base.focus) ||
      socialPlatformSchema.options.some((target) => {
        const edit = edits[`${item.id}:${target}`];
        return edit && JSON.stringify(edit) !== JSON.stringify(base.drafts[target]);
      })
    );
  };
  const hasEdits = experience.scenes.some(isSceneDirty);
  useEffect(() => onDirtyChange(hasEdits), [hasEdits, onDirtyChange]);

  function update(patch: Partial<SocialDraft>) {
    rememberRevision();
    setEdits((previous) => ({ ...previous, [key]: { ...draft, ...patch } }));
    setMessage('');
  }
  function updateFocus(next: SocialFocus) {
    rememberRevision();
    setFocusEdits((previous) => ({ ...previous, [scene.id]: next }));
    setMessage('');
  }
  function rememberRevision() {
    // A refresh may deliver another tab's save while our draft is still being edited.
    if (!isSceneDirty(scene))
      setEditRevisions((previous) => ({ ...previous, [scene.id]: social.revision }));
  }
  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await onSave(scene.id, {
        expectedVersion: experience.bibleVersion,
        expectedRevision: editRevisions[scene.id] ?? social.revision,
        platform,
        draft,
        focus,
      });
      setSaved((previous) => ({ ...previous, [scene.id]: result }));
      setEditRevisions((previous) => ({ ...previous, [scene.id]: result.revision }));
      setEdits((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      setFocusEdits((previous) => {
        const next = { ...previous };
        delete next[scene.id];
        return next;
      });
      setMessage(msg('platformSaved', { platform: msg(`platform_${platform}`) }));
    } catch (cause) {
      setError(msg.error(cause));
    } finally {
      setSaving(false);
    }
  }
  const asset =
    scene.assets.find(
      (item) => item.id === scene.approvedAssetId && item.bibleVersion === experience.bibleVersion,
    ) ?? scene.assets.filter((item) => item.bibleVersion === experience.bibleVersion).at(-1);
  const image = asset?.image ?? demoPreview(experience, scene);
  const overBudget = draft.caption.length > preset.draftLimit;
  const source = asset ?? demoSourceSize[hasPhotoPreset(experience) ? 'photo' : 'illustration'];
  let exportSize = '';
  try {
    const frame = exportFrame(source, platform, focus);
    exportSize = msg('m5b9ef7b946', { v0: frame.width, v1: frame.height });
  } catch {
    exportSize = msg('m2e4c32a617');
  }
  // object-fit: cover at the focus, then scaled from that same point, shows exportFrame's crop.
  const imageStyle: CSSProperties = {
    objectPosition: `${focus.x}% ${focus.y}%`,
    transformOrigin: `${focus.x}% ${focus.y}%`,
    transform: focus.zoom > 1 ? `scale(${focus.zoom})` : undefined,
  };
  const safe = preset.safeArea;
  const coverTitle = cover.sceneId === scene.id ? cover.title : '';
  // The export sizes text in units of 1% of the image's shorter side. Express that unit in the
  // safe zone's container width so preview text keeps the export's proportions at any size.
  const [ratioWidth, ratioHeight] = preset.aspect;
  const safeZoneStyle = {
    inset: `${safe.top}% ${safe.right}% ${safe.bottom}% ${safe.left}%`,
    '--u': `${((Math.min(1, ratioHeight / ratioWidth) * 100) / (100 - safe.left - safe.right)).toFixed(3)}cqw`,
  } as CSSProperties;

  return (
    <section className="social-composer" aria-label={msg('mb02cd80b2f')}>
      <div className="composer-intro">
        <div>
          <p className="eyebrow">{msg('mf857b0423a')}</p>
          <h3>{msg('m79ca1c9f20')}</h3>
          <p>{msg('m602b7c4af2')}</p>
        </div>
        <span className="composer-save-state">
          {hasEdits ? msg('m8a555420cf') : msg('m1e9da12960')}
        </span>
      </div>
      <div className="composer-scenes" role="group" aria-label={msg('m6bcf0747c1')}>
        {experience.scenes.map((item) => (
          <button
            type="button"
            className={`composer-scene ${item.id === scene.id ? 'selected' : ''}`}
            key={item.id}
            aria-pressed={item.id === scene.id}
            aria-label={msg('mfe1f6f755d', { v0: item.title })}
            disabled={saving}
            onClick={() => {
              onSelectScene(item.id);
              setMessage('');
              setError('');
            }}
          >
            <img
              src={
                item.assets.find(
                  (asset) =>
                    asset.id === item.approvedAssetId &&
                    asset.bibleVersion === experience.bibleVersion,
                )?.image ?? demoPreview(experience, item)
              }
              alt={' '}
              width={60}
              height={80}
            />
            <span>
              <strong>
                {String(item.ordinal + 1).padStart(2, '0')} · {item.title}
              </strong>
              <span>
                {msg(`platform_${choices[item.id] ?? baseFor(item.id, item.social).platform}`)}
                {isSceneDirty(item) && msg('m83bdaa0cc6')}
              </span>
            </span>
            {item.id === scene.id && <Check size={18} />}
          </button>
        ))}
      </div>
      <div className="composer-layout">
        <form
          className="composer-form form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="composer-step">
            <span>01</span>
            <h4>{msg('m742af78e50')}</h4>
          </div>
          <label htmlFor="post-platform">
            {msg('m9a533b31d5')}
            <select
              id="post-platform"
              value={platform}
              disabled={saving}
              onChange={(event) => {
                rememberRevision();
                setChoices((previous) => ({
                  ...previous,
                  [scene.id]: event.target.value as SocialPlatform,
                }));
                setMessage('');
                setError('');
              }}
            >
              {socialPlatformSchema.options.map((value) => (
                <option key={value} value={value}>
                  {msg(`platform_${value}`)}
                  {edits[`${scene.id}:${value}`] &&
                  JSON.stringify(edits[`${scene.id}:${value}`]) !==
                    JSON.stringify(social.drafts[value])
                    ? msg('m391bea5bf7')
                    : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="platform-guidance">{msg(`hint_${platform}`)}</p>
          <label htmlFor="post-tone">
            {msg('mb7971e6580')}
            <select
              id="post-tone"
              value={draft.tone}
              disabled={saving}
              onChange={(event) => update({ tone: event.target.value as SocialDraft['tone'] })}
            >
              {socialToneSchema.options.map((value) => (
                <option key={value} value={value}>
                  {msg(`tone_${value}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="suggestion-action">
            <button
              type="button"
              className="button"
              disabled={saving}
              onClick={() => update(suggestSocialCopy(experience, scene, platform, draft.tone))}
            >
              <Sparkles size={18} /> {msg('me4bf423b96')}
            </button>
            <span className="fine-print">{msg('m732b10f6b8')}</span>
          </div>
          <div className="composer-text-field">
            <label htmlFor="post-caption">{msg('m582c915c53')}</label>
            <textarea
              id="post-caption"
              dir="auto"
              rows={7}
              value={draft.caption}
              disabled={saving}
              maxLength={2200}
              aria-describedby="post-budget"
              aria-invalid={overBudget}
              onChange={(event) => update({ caption: event.target.value })}
            />
          </div>
          <p
            id="post-budget"
            className={`caption-budget ${overBudget ? 'over-budget' : ''}`}
            aria-live="polite"
          >
            {msg('charCount', { count: draft.caption.length, limit: preset.draftLimit })}
            {overBudget ? msg('m71c0a6e34c') : ''}
          </p>
          {preset.vertical && (
            <div className="composer-text-field">
              <label htmlFor="post-overlay">{msg('m402103ebfc')}</label>
              <span className="fine-print">{msg('mc5c339ffbc')}</span>
              <textarea
                id="post-overlay"
                dir="auto"
                rows={2}
                maxLength={80}
                value={draft.overlayText}
                disabled={saving}
                onChange={(event) => update({ overlayText: event.target.value })}
              />
            </div>
          )}
          {error && (
            <p className="modal-error" role="alert">
              {error}
            </p>
          )}
          <div className="composer-actions">
            <button className="button primary" disabled={saving || !changed || overBudget}>
              {saving ? msg('m56a2285c5b') : msg('mc9906dfac5')} <Check size={18} />
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                void navigator.clipboard.writeText(draft.caption).then(
                  () => setMessage(msg('m067b52346c')),
                  () => setError(msg('m8a2b6128ae')),
                );
              }}
            >
              <Copy size={18} /> {msg('m06a76cc6ee')}
            </button>
          </div>
          <a className="composer-preview-link" href="#post-preview">
            {msg('m6b964d227a')}
            <ArrowRight size={18} />
          </a>
          <p className="composer-message" role="status">
            {message || (changed ? msg('mfb9dae5eda') : msg('m1ce57a132f'))}
          </p>
        </form>
        <div className="composer-preview-column" id="post-preview">
          <div className="composer-preview-heading">
            <div className="composer-step">
              <span>02</span>
              <h4>{msg('m64e85d5749')}</h4>
            </div>
            <span className="preview-format">{preset.ratioLabel}</span>
          </div>
          <p className="preview-description">
            {msg(`platform_${platform}`)} · {msg(`format_${preset.format.replaceAll(' ', '_')}`)}
          </p>
          <article
            className={`platform-preview platform-${platform} ${preset.vertical ? 'vertical-preview' : ''}`}
            aria-label={msg('m80bd28e4c3', { v0: msg(`platform_${platform}`) })}
          >
            <div className="platform-preview-header">
              <span className="avatar">{msg('m6dcd4ce23d')}</span>
              <div>
                <strong>
                  {platform === 'linkedin' || platform === 'facebook'
                    ? msg('mab9944bc64')
                    : 'alex.imagines'}
                </strong>
                <span>
                  {preset.network} {msg('m003ed63aa8')}
                </span>
              </div>
              <span className="preview-menu" aria-hidden="true">
                ···
              </span>
            </div>
            {(platform === 'linkedin' || platform === 'x' || platform === 'facebook') && (
              <p className="preview-caption" dir="auto">
                {draft.caption || msg('m7124f1e43d')}
              </p>
            )}
            <div className="platform-preview-image" style={{ aspectRatio: preset.ratio }}>
              <img
                src={image}
                alt={msg('m94ce4e3116', { v0: scene.title })}
                width={600}
                height={800}
                style={imageStyle}
              />
              {preset.vertical && (
                <span className="preview-story-label">
                  {msg(`format_${preset.format.replaceAll(' ', '_')}`)}
                </span>
              )}
              {/* Text sits inside the format's safe area, as it does in the exported image. */}
              <div className="preview-safe-zone" style={safeZoneStyle}>
                {coverTitle && (
                  <p className="preview-cover-title" dir="auto">
                    {coverTitle}
                  </p>
                )}
                {preset.vertical && draft.overlayText && (
                  <p className="preview-overlay" dir="auto">
                    {draft.overlayText}
                  </p>
                )}
                <span className="preview-disclosure">{msg('disclosure')}</span>
              </div>
            </div>
            <div className="preview-social-icons" aria-hidden="true">
              <Heart size={20} />
              <MessageCircle size={20} />
              <Send size={20} />
              <Bookmark size={20} />
            </div>
            {platform !== 'linkedin' && platform !== 'x' && platform !== 'facebook' && (
              <p className="preview-caption" dir="auto">
                {draft.caption || msg('m7124f1e43d')}
              </p>
            )}
          </article>
          {/* Beside the image it moves; on phones this keeps Write post's text field tall. */}
          <div className="crop-control">
            <button
              type="button"
              className="button"
              disabled={saving}
              aria-describedby="post-crop-state"
              onClick={() => setCropping(true)}
            >
              <Crop size={18} /> {msg('mab5c626179')}
            </button>
            <p id="post-crop-state" className="fine-print">
              {msg('cropState', { zoom: Math.round(focus.zoom * 100), size: exportSize })}
            </p>
          </div>
          {cropping && (
            <CropEditor
              image={image}
              alt={msg('m90d8a836ae', { v0: scene.title })}
              source={source}
              platform={platform}
              focus={focus}
              onApply={(next) => {
                setCropping(false);
                if (sameFocus(next, focus)) return;
                updateFocus(next);
                setMessage(msg('med33948fb4'));
              }}
              onClose={() => setCropping(false)}
            />
          )}
          <p className="preview-note">
            {msg('meb9f4dbb64')}
            {preset.ratioLabel} {msg('mc18e8b20be')}
          </p>
          {scene.status !== 'approved' && <p className="preview-note">{msg('me9b7f1a085')}</p>}
          <div className="composer-next">
            <ArrowRight size={18} />
            <p>{msg('m34f61e6151')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
