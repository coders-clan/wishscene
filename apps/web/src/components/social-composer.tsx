'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Bookmark,
  Check,
  Copy,
  Heart,
  MessageCircle,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  cropAxis,
  demoPreview,
  demoSourceSize,
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

const sameFocus = (a: SocialFocus, b: SocialFocus) => a.x === b.x && a.y === b.y;

interface Props {
  experience: Experience;
  selectedSceneId: string | null;
  onSelectScene: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (sceneId: string, input: SocialUpdate) => Promise<SceneSocial>;
}

export function SocialComposer({
  experience,
  selectedSceneId,
  onSelectScene,
  onDirtyChange,
  onSave,
}: Props) {
  const [edits, setEdits] = useState<Record<string, SocialDraft>>({});
  const [focusEdits, setFocusEdits] = useState<Record<string, SocialFocus>>({});
  const [choices, setChoices] = useState<Record<string, SocialPlatform>>({});
  const [saved, setSaved] = useState<Record<string, SceneSocial>>({});
  const [editRevisions, setEditRevisions] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
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
  useEffect(() => {
    if (!hasEdits) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasEdits]);

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
      setMessage(`${preset.label} saved for this image.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this post. Try again.');
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
  const axis = cropAxis(source, platform);
  const safe = preset.safeArea;
  const coverTitle = experience.pack.order[0] === scene.id ? experience.pack.coverTitle : '';
  // The export sizes text in units of 1% of the image's shorter side. Express that unit in the
  // safe zone's container width so preview text keeps the export's proportions at any size.
  const [ratioWidth, ratioHeight] = preset.aspect;
  const safeZoneStyle = {
    inset: `${safe.top}% ${safe.right}% ${safe.bottom}% ${safe.left}%`,
    '--u': `${((Math.min(1, ratioHeight / ratioWidth) * 100) / (100 - safe.left - safe.right)).toFixed(3)}cqw`,
  } as CSSProperties;

  return (
    <section className="social-composer" aria-label="Per-image social composer">
      <div className="composer-intro">
        <div>
          <p className="eyebrow">ONE IMAGE. YOUR KIND OF POST.</p>
          <h3>Make it fit the feed.</h3>
          <p>Choose an image, pick a platform, and make the words your own.</p>
        </div>
        <span className="composer-save-state">
          {hasEdits ? 'Unsaved post drafts' : 'Posts saved in this demo session'}
        </span>
      </div>
      <div className="composer-scenes" role="group" aria-label="Choose an image">
        {experience.scenes.map((item) => (
          <button
            type="button"
            className={`composer-scene ${item.id === scene.id ? 'selected' : ''}`}
            key={item.id}
            aria-pressed={item.id === scene.id}
            aria-label={`Compose post for ${item.title}`}
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
              alt=""
              width={60}
              height={80}
            />
            <span>
              <strong>
                {String(item.ordinal + 1).padStart(2, '0')} · {item.title}
              </strong>
              <span>
                {socialPlatforms[choices[item.id] ?? baseFor(item.id, item.social).platform].label}
                {isSceneDirty(item) && ' · Unsaved'}
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
            <h4>Shape this post</h4>
          </div>
          <label htmlFor="post-platform">
            Platform & format
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
                  {socialPlatforms[value].label}
                  {edits[`${scene.id}:${value}`] &&
                  JSON.stringify(edits[`${scene.id}:${value}`]) !==
                    JSON.stringify(social.drafts[value])
                    ? ' (unsaved)'
                    : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="platform-guidance">{preset.hint}</p>
          <label htmlFor="post-tone">
            Writing tone
            <select
              id="post-tone"
              value={draft.tone}
              disabled={saving}
              onChange={(event) => update({ tone: event.target.value as SocialDraft['tone'] })}
            >
              {socialToneSchema.options.map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
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
              <Sparkles size={18} /> Use suggested text
            </button>
            <span className="fine-print">
              Demo templates. Replaces this platform’s caption and overlay.
            </span>
          </div>
          <div className="composer-text-field">
            <label htmlFor="post-caption">Post text</label>
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
            {draft.caption.length} / {preset.draftLimit} draft characters
            {overBudget ? ' · Shorten the text to save.' : ''}
          </p>
          {preset.vertical && (
            <div className="composer-text-field">
              <label htmlFor="post-overlay">Text on image</label>
              <span className="fine-print">Optional · up to 80 characters</span>
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
              {saving ? 'Saving…' : 'Save post'} <Check size={18} />
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                void navigator.clipboard.writeText(draft.caption).then(
                  () => setMessage('Post text copied.'),
                  () => setError('Clipboard unavailable. Select and copy the post text above.'),
                );
              }}
            >
              <Copy size={18} /> Copy text
            </button>
          </div>
          <a className="composer-preview-link" href="#post-preview">
            View preview <ArrowRight size={18} />
          </a>
          <p className="composer-message" role="status">
            {message ||
              (changed
                ? 'Previewing your unsaved changes.'
                : 'Each image keeps its own platform and text.')}
          </p>
        </form>
        <div className="composer-preview-column" id="post-preview">
          <div className="composer-preview-heading">
            <div className="composer-step">
              <span>02</span>
              <h4>Preview your post</h4>
            </div>
            <span className="preview-format">{preset.ratioLabel}</span>
          </div>
          <p className="preview-description">
            {preset.label} · {preset.format}
          </p>
          <article
            className={`platform-preview platform-${platform} ${preset.vertical ? 'vertical-preview' : ''}`}
            aria-label={`${preset.label} preview`}
          >
            <div className="platform-preview-header">
              <span className="avatar">A</span>
              <div>
                <strong>
                  {platform === 'linkedin' || platform === 'facebook'
                    ? 'Alex Morgan'
                    : 'alex.imagines'}
                </strong>
                <span>{preset.network} · Preview</span>
              </div>
              <span className="preview-menu" aria-hidden="true">
                ···
              </span>
            </div>
            {(platform === 'linkedin' || platform === 'x' || platform === 'facebook') && (
              <p className="preview-caption" dir="auto">
                {draft.caption || 'Your text will appear here.'}
              </p>
            )}
            <div className="platform-preview-image" style={{ aspectRatio: preset.ratio }}>
              <img
                src={image}
                alt={`Post preview: ${scene.title}`}
                width={600}
                height={800}
                style={{ objectPosition: `${focus.x}% ${focus.y}%` }}
              />
              {preset.vertical && <span className="preview-story-label">{preset.format}</span>}
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
                <span className="preview-disclosure">AI-created · Fictional scene</span>
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
                {draft.caption || 'Your text will appear here.'}
              </p>
            )}
          </article>
          {/* Beside the image it moves; on phones this keeps Write post's text field tall. */}
          {axis && (
            <div className="crop-control">
              <label htmlFor="post-crop">Crop position</label>
              <input
                id="post-crop"
                type="range"
                min={0}
                max={100}
                step={1}
                value={focus[axis]}
                disabled={saving}
                aria-describedby="post-crop-hint"
                aria-valuetext={
                  axis === 'y' ? `${focus.y}% from the top` : `${focus.x}% from the left`
                }
                onChange={(event) => updateFocus({ ...focus, [axis]: Number(event.target.value) })}
              />
              <p id="post-crop-hint" className="fine-print">
                {preset.ratioLabel} trims the {axis === 'y' ? 'top and bottom' : 'sides'}. Slide to
                choose what stays in the exported image, then save the post.
              </p>
            </div>
          )}
          <p className="preview-note">
            The dashed line marks a suggested safe area for text. The export draws this crop, its
            text and the AI label into a {preset.ratioLabel} JPEG; the original image is included
            too.
          </p>
          {scene.status !== 'approved' && (
            <p className="preview-note">
              You can plan this post now. Approve the scene before exporting.
            </p>
          )}
          <div className="composer-next">
            <ArrowRight size={18} />
            <p>
              Save each image’s post, then export the pack below. Nothing is published to a social
              account.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
