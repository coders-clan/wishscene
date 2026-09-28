import { z } from 'zod';
import type { ExperienceInput, Scene } from './index';

export const socialPlatformSchema = z.enum([
  'instagram',
  'instagram-story',
  'tiktok',
  'facebook',
  'linkedin',
  'x',
]);
export type SocialPlatform = z.infer<typeof socialPlatformSchema>;
export const socialToneSchema = z.enum(['playful', 'understated', 'cinematic']);
export type SocialTone = z.infer<typeof socialToneSchema>;

// Safe areas are percentage insets (top, right, bottom, left) where platform UI rarely covers
// the image. They are wishscene layout guidance, not official platform guarantees.
const feedSafeArea = { top: 6, right: 6, bottom: 6, left: 6 } as const;

// App preview presets and writing budgets, not provider API limits or exact platform UI.
// `output` is the largest export size; smaller sources are never upscaled.
export const socialPlatforms = {
  instagram: {
    label: 'Instagram post',
    network: 'Instagram',
    format: 'Portrait feed',
    ratio: '4 / 5',
    ratioLabel: '4:5',
    aspect: [4, 5],
    output: { width: 1080, height: 1350 },
    safeArea: feedSafeArea,
    draftLimit: 2200,
    vertical: false,
    hint: 'A visual hook, a little atmosphere, and a few relevant hashtags.',
  },
  'instagram-story': {
    label: 'Instagram Story',
    network: 'Instagram',
    format: 'Story',
    ratio: '9 / 16',
    ratioLabel: '9:16',
    aspect: [9, 16],
    output: { width: 1080, height: 1920 },
    safeArea: { top: 14, right: 8, bottom: 20, left: 8 },
    draftLimit: 220,
    vertical: true,
    hint: 'Keep the on-image text short. The caption is saved as a separate note.',
  },
  tiktok: {
    label: 'TikTok photo',
    network: 'TikTok',
    format: 'Photo post',
    ratio: '9 / 16',
    ratioLabel: '9:16',
    aspect: [9, 16],
    output: { width: 1080, height: 1920 },
    safeArea: { top: 12, right: 16, bottom: 22, left: 8 },
    draftLimit: 1500,
    vertical: true,
    hint: 'Lead with a quick hook and use the overlay for the first impression.',
  },
  facebook: {
    label: 'Facebook post',
    network: 'Facebook',
    format: 'Square feed',
    ratio: '1 / 1',
    ratioLabel: '1:1',
    aspect: [1, 1],
    output: { width: 1080, height: 1080 },
    safeArea: feedSafeArea,
    draftLimit: 2000,
    vertical: false,
    hint: 'Use a conversational caption and a question people can answer.',
  },
  linkedin: {
    label: 'LinkedIn post',
    network: 'LinkedIn',
    format: 'Square feed',
    ratio: '1 / 1',
    ratioLabel: '1:1',
    aspect: [1, 1],
    output: { width: 1080, height: 1080 },
    safeArea: feedSafeArea,
    draftLimit: 1500,
    vertical: false,
    hint: 'Explain the creative idea and the process behind the image.',
  },
  x: {
    label: 'X post',
    network: 'X',
    format: 'Landscape feed',
    ratio: '16 / 9',
    ratioLabel: '16:9',
    aspect: [16, 9],
    output: { width: 1600, height: 900 },
    safeArea: feedSafeArea,
    draftLimit: 240,
    vertical: false,
    hint: 'One concise thought. Check the final text in X before posting.',
  },
} as const;

/** Zooming in crops a smaller part of the source, so the export shrinks rather than upscales. */
export const maxSocialZoom = 3;
/**
 * Crop position as percentages, with the same meaning as CSS `object-position`, and a zoom
 * factor over the largest crop of the format that fits the source (1 = no zoom).
 */
export const socialFocusSchema = z
  .object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    zoom: z.number().min(1).max(maxSocialZoom).default(1),
  })
  .strict();
export type SocialFocus = z.infer<typeof socialFocusSchema>;
export const defaultSocialFocus: SocialFocus = { x: 50, y: 45, zoom: 1 };

type Size = { width: number; height: number };
type Point = { x: number; y: number };
type Rect = Point & Size;
/** The part of the source a format shows at this focus, in source pixels. */
export function cropRect(source: Size, platform: SocialPlatform, focus: SocialFocus): Rect {
  const [a, b] = socialPlatforms[platform].aspect;
  const scale = Math.min(source.width / a, source.height / b) / focus.zoom;
  const width = a * scale;
  const height = b * scale;
  return {
    x: ((source.width - width) * focus.x) / 100,
    y: ((source.height - height) * focus.y) / 100,
    width,
    height,
  };
}
/** The source point at a position in the crop frame, given as fractions of its size. */
export function cropPoint(
  source: Size,
  platform: SocialPlatform,
  focus: SocialFocus,
  at: Point,
): Point {
  const crop = cropRect(source, platform, focus);
  return { x: crop.x + at.x * crop.width, y: crop.y + at.y * crop.height };
}
/**
 * The focus at `zoom` that keeps source `point` under frame position `at`, as a drag or pinch
 * does. Positions clamp at the image edges; an axis with nothing to trim keeps `current`.
 */
export function focusAt(
  source: Size,
  platform: SocialPlatform,
  current: SocialFocus,
  zoom: number,
  point: Point,
  at: Point,
): SocialFocus {
  const round = (value: number) => Math.round(value * 100) / 100;
  const next = round(Math.min(maxSocialZoom, Math.max(1, zoom)));
  const crop = cropRect(source, platform, { x: 0, y: 0, zoom: next });
  const percent = (start: number, room: number, fallback: number) =>
    room < 0.01 ? fallback : round(Math.min(100, Math.max(0, (start / room) * 100)));
  return {
    x: percent(point.x - at.x * crop.width, source.width - crop.width, current.x),
    y: percent(point.y - at.y * crop.height, source.height - crop.height, current.y),
    zoom: next,
  };
}

export interface ExportFrame {
  width: number;
  height: number;
  crop: Rect;
}
// hunch-why: The preview (object-fit: cover at the focus, scaled from the same origin), the crop editor and the export renderer share this geometry, so a downloaded crop matches what the user saw. Output sizes are exact multiples of the aspect ratio and never upscale the source, so zooming in lowers the export size instead.
export function exportFrame(
  source: Size,
  platform: SocialPlatform,
  focus: SocialFocus,
): ExportFrame {
  const {
    aspect: [a, b],
    output,
  } = socialPlatforms[platform];
  const crop = cropRect(source, platform, focus);
  const unit = Math.floor(Math.min(output.width, crop.width) / a);
  if (unit < 1) throw new RangeError('The source image is too small to export.');
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    width: unit * a,
    height: unit * b,
    crop: {
      x: round(crop.x),
      y: round(crop.y),
      width: round(crop.width),
      height: round(crop.height),
    },
  };
}
/** Which crop direction a format leaves adjustable for a source, if any. */
export function cropAxis(
  source: { width: number; height: number },
  platform: SocialPlatform,
): 'x' | 'y' | null {
  const [a, b] = socialPlatforms[platform].aspect;
  const difference = a * source.height - b * source.width;
  return difference === 0 ? null : difference > 0 ? 'y' : 'x';
}

export const socialDraftSchema = z
  .object({
    caption: z.string().max(2200),
    overlayText: z.string().max(80),
    tone: socialToneSchema,
  })
  .strict();
export type SocialDraft = z.infer<typeof socialDraftSchema>;
export interface SceneSocial {
  platform: SocialPlatform;
  revision: number;
  drafts: Record<SocialPlatform, SocialDraft>;
  focus: SocialFocus;
}
export interface SocialExport extends SocialDraft {
  platform: SocialPlatform;
  focus: SocialFocus;
  previewAspectRatio: string;
  previewOnly: true;
}
export const socialUpdate = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedRevision: z.number().int().nonnegative(),
    platform: socialPlatformSchema,
    draft: socialDraftSchema,
    focus: socialFocusSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.draft.caption.length > socialPlatforms[input.platform].draftLimit)
      context.addIssue({
        code: 'custom',
        path: ['draft', 'caption'],
        message: 'Caption exceeds this preview’s writing budget.',
      });
  });
export type SocialUpdate = z.infer<typeof socialUpdate>;

export function suggestSocialCopy(
  experience: Pick<ExperienceInput, 'destination' | 'mood'>,
  scene: Pick<Scene, 'title'>,
  platform: SocialPlatform,
  tone: SocialTone,
): SocialDraft {
  const place = experience.destination;
  const hooks = {
    playful: `Mentally in ${place}. My imagination packed first.`,
    understated: `An imagined moment in ${place}.`,
    cinematic: `${place}, somewhere between a frame and a daydream.`,
  };
  const hook = hooks[tone];
  const disclosure = 'AI-created fictional scene · wishscene';
  const captions: Record<SocialPlatform, string> = {
    instagram: `${hook}\n${scene.title}. ${experience.mood} energy.\n\n${disclosure}\n#${place} #CreativePhotography #wishscene`,
    'instagram-story': `${hook}\n${scene.title}.\n${disclosure}`,
    tiktok: `POV: your imagination takes you to ${place}.\n${scene.title}. ${hook}\n\n${disclosure}\n#PhotoMode #${place} #wishscene`,
    facebook: `${hook}\n\n${scene.title} — a creative take on ${experience.mood.toLowerCase()}. Where would you set your next imagined scene?\n\n${disclosure}`,
    linkedin: `${scene.title}: a visual concept inspired by ${place}.\n\n${hook} This AI-created study explores how a shared mood (${experience.mood.toLowerCase()}) can connect images into a story.\n\nCreated with wishscene. Fictional scene, not a record of travel.\n#CreativeProcess #VisualStorytelling`,
    x: `${hook}\n${scene.title}.\n${disclosure}`,
  };
  return {
    caption: captions[platform],
    overlayText: socialPlatforms[platform].vertical ? scene.title : '',
    tone,
  };
}

export function makeSceneSocial(
  experience: ExperienceInput,
  scene: Pick<Scene, 'title'>,
): SceneSocial {
  const drafts = Object.fromEntries(
    socialPlatformSchema.options.map((platform) => [
      platform,
      suggestSocialCopy(experience, scene, platform, 'understated'),
    ]),
  ) as Record<SocialPlatform, SocialDraft>;
  return { platform: 'instagram', revision: 0, drafts, focus: { ...defaultSocialFocus } };
}

export const coverTitleLimit = 64;
/** Carousel order (scene ids, first is the cover) and the title printed on the cover. */
export interface SocialPack {
  order: string[];
  coverTitle: string;
  revision: number;
}
export const packUpdate = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    order: z.array(z.string().min(1).max(200)).min(1).max(12),
    coverTitle: z.string().trim().max(coverTitleLimit),
  })
  .strict();
export type PackUpdate = z.infer<typeof packUpdate>;
