import type { Destination, ExperienceInput, Scene } from './index';

/** Bundled fictional photos. A preset is a complete look, not a live model prompt. */
export const demoPresets = {
  Tokyo: {
    outfit: 'Ivory jacket · charcoal trousers',
    mood: 'After hours',
    photos: ['tokyo-neon', 'tokyo-cafe', 'tokyo-rooftop', 'tokyo-walk'],
  },
  Kyoto: {
    outfit: 'Sage overshirt · sand chinos',
    mood: 'Slow living',
    photos: ['kyoto-garden', 'kyoto-matcha', 'kyoto-lanterns', 'kyoto-hill'],
  },
  Amalfi: {
    outfit: 'Linen shirt · relaxed neutrals',
    mood: 'Golden hour',
    photos: ['amalfi-coast', 'amalfi-espresso', 'amalfi-walk', 'amalfi-sunset'],
  },
  Iceland: {
    outfit: 'Amber parka · hiking boots',
    mood: 'Adventure',
    photos: ['iceland-mountain', 'iceland-landscape', 'iceland-cabin', 'iceland-aurora'],
  },
} as const satisfies Record<
  Destination,
  {
    outfit: string;
    mood: ExperienceInput['mood'];
    photos: readonly [string, string, string, string];
  }
>;

/** Export source size per fixture type. SVGs rasterize at 2× their 600×800 viewBox. */
export const demoSourceSize = {
  photo: { width: 1086, height: 1448 },
  illustration: { width: 1200, height: 1600 },
} as const;

type StoryLook = Pick<ExperienceInput, 'destination' | 'outfit' | 'mood'>;

// hunch-why: Photo fixtures only represent their recorded destination, outfit and mood. Custom inputs must fall back to labeled illustrations instead of claiming the same photos follow arbitrary settings.
export function hasPhotoPreset(story: StoryLook): boolean {
  const preset = demoPresets[story.destination];
  return story.outfit === preset.outfit && story.mood === preset.mood;
}

export function demoPreview(story: StoryLook, scene: Pick<Scene, 'ordinal' | 'art'>): string {
  const photo = hasPhotoPreset(story) && demoPresets[story.destination].photos[scene.ordinal];
  return photo ? `/demo/photos/${photo}.jpg` : `/demo/${scene.art}.svg`;
}
