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

// App preview presets and writing budgets, not provider API limits or exact platform UI.
export const socialPlatforms = {
  instagram: {
    label: 'Instagram post',
    network: 'Instagram',
    format: 'Portrait feed',
    ratio: '4 / 5',
    ratioLabel: '4:5',
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
    draftLimit: 240,
    vertical: false,
    hint: 'One concise thought. Check the final text in X before posting.',
  },
} as const;

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
}
export interface SocialExport extends SocialDraft {
  platform: SocialPlatform;
  previewAspectRatio: string;
  previewOnly: true;
}
export const socialUpdate = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedRevision: z.number().int().nonnegative(),
    platform: socialPlatformSchema,
    draft: socialDraftSchema,
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
  return { platform: 'instagram', revision: 0, drafts };
}
