'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import {
  coverTitleLimit,
  demoPreview,
  type Experience,
  type PackUpdate,
  type SocialPack,
} from '@wishscene/contracts';

/** The cover the carousel shows right now, unsaved edits included, for the post preview. */
export type PackCover = { experienceId: string; sceneId: string; title: string };

interface Props {
  experience: Experience;
  onDirtyChange: (dirty: boolean) => void;
  onCoverChange: (cover: PackCover) => void;
  onSave: (input: PackUpdate) => Promise<SocialPack>;
}

type Draft = { order: string[]; coverTitle: string; baseRevision: number };

// hunch-why: Carousel edits stay local until Save, like post drafts. The save carries the revision the edit started from, so another tab's newer carousel is reported instead of overwritten.
export function PackEditor({ experience, onDirtyChange, onCoverChange, onSave }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<SocialPack | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  // A workspace refresh can be skipped while another is in flight, so show our own save until
  // the workspace catches up with it.
  const pack = saved && saved.revision > experience.pack.revision ? saved : experience.pack;
  const order = draft?.order ?? pack.order;
  const coverTitle = draft?.coverTitle ?? pack.coverTitle;
  const dirty =
    !!draft && (draft.coverTitle !== pack.coverTitle || draft.order.join() !== pack.order.join());
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const coverSceneId = order[0];
  useEffect(
    () => onCoverChange({ experienceId: experience.id, sceneId: coverSceneId, title: coverTitle }),
    [experience.id, coverSceneId, coverTitle, onCoverChange],
  );
  const sceneFor = (id: string) => experience.scenes.find((scene) => scene.id === id);

  function edit(patch: Partial<Omit<Draft, 'baseRevision'>>) {
    setDraft({ order, coverTitle, baseRevision: draft?.baseRevision ?? pack.revision, ...patch });
    setError('');
    setStatus('');
  }
  function move(index: number, delta: -1 | 1) {
    const next = [...order];
    const target = index + delta;
    [next[index], next[target]] = [next[target], next[index]];
    const id = next[target];
    edit({ order: next });
    setStatus(
      `${sceneFor(id)?.title} moved to position ${target + 1} of ${next.length}.${target === 0 ? ' It is now the cover.' : ''}`,
    );
    // Keep keyboard focus on the moved image. At either end, use its other arrow.
    requestAnimationFrame(() => {
      const same = document.getElementById(`pack-${delta < 0 ? 'up' : 'down'}-${id}`);
      const other = document.getElementById(`pack-${delta < 0 ? 'down' : 'up'}-${id}`);
      (same instanceof HTMLButtonElement && !same.disabled ? same : other)?.focus();
    });
  }
  async function save() {
    if (!draft || !dirty) return;
    setSaving(true);
    setError('');
    try {
      setSaved(
        await onSave({
          expectedRevision: draft.baseRevision,
          order: draft.order,
          coverTitle: draft.coverTitle,
        }),
      );
      setDraft(null);
      setStatus('Carousel saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the carousel. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="pack-editor"
      aria-labelledby="pack-editor-title"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h3 id="pack-editor-title">
        Carousel <span>Order and cover</span>
      </h3>
      <p>Set the order people swipe through. The first image is the cover.</p>
      <label htmlFor="cover-title">Cover title</label>
      <input
        id="cover-title"
        dir="auto"
        maxLength={coverTitleLimit}
        value={coverTitle}
        disabled={saving}
        aria-describedby="cover-title-hint"
        onChange={(event) => edit({ coverTitle: event.target.value })}
      />
      <p id="cover-title-hint" className="fine-print">
        Drawn on the cover image in the export. Leave it empty for no title.
      </p>
      <ol className="pack-order" aria-label="Carousel order">
        {order.map((id, index) => {
          const scene = sceneFor(id);
          if (!scene) return null;
          const image =
            scene.assets.find(
              (asset) =>
                asset.id === scene.approvedAssetId &&
                asset.bibleVersion === experience.bibleVersion,
            )?.image ?? demoPreview(experience, scene);
          return (
            <li key={id}>
              <img src={image} alt="" width={45} height={60} />
              <span className="pack-order-title">
                <strong>
                  {String(index + 1).padStart(2, '0')} · {scene.title}
                </strong>
                {index === 0 && <span className="pack-cover-badge">Cover</span>}
              </span>
              <button
                type="button"
                className="icon-button"
                id={`pack-up-${id}`}
                aria-label={`Move ${scene.title} earlier`}
                disabled={saving || index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={18} />
              </button>
              <button
                type="button"
                className="icon-button"
                id={`pack-down-${id}`}
                aria-label={`Move ${scene.title} later`}
                disabled={saving || index === order.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={18} />
              </button>
            </li>
          );
        })}
      </ol>
      {error && (
        <p className="modal-error" role="alert">
          {error}
        </p>
      )}
      <div className="caption-actions">
        <span role="status">{status || (dirty ? 'Unsaved carousel changes' : '')}</span>
        <div className="pack-actions">
          <button
            type="button"
            className="button"
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(null);
              setError('');
              setStatus('Carousel changes discarded.');
            }}
          >
            Discard
          </button>
          <button className="button primary" disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save carousel'} <Check size={18} />
          </button>
        </div>
      </div>
    </form>
  );
}
