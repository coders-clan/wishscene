import {
  demoPreview,
  demoSourceSize,
  hasPhotoPreset,
  type Asset,
  type Scene,
  type ExperienceInput,
} from '@wishscene/contracts';

export interface ImageProvider {
  candidates(input: {
    jobId: string;
    scene: Scene;
    story: Pick<ExperienceInput, 'destination' | 'outfit' | 'mood'>;
    bibleVersion: number;
    createdAt: string;
  }): Asset[];
}

/** Pure fixture adapter. No network, credentials, or personal images. */
export class MockImageProvider implements ImageProvider {
  candidates({
    jobId,
    scene,
    story,
    bibleVersion,
    createdAt,
  }: Parameters<ImageProvider['candidates']>[0]): Asset[] {
    const photo = hasPhotoPreset(story);
    return (photo ? [0] : [0, 1]).map((variant) => ({
      id: `${jobId}-candidate-${variant}`,
      sceneId: scene.id,
      bibleVersion,
      createdAt,
      image: photo ? demoPreview(story, scene) : `/demo/${scene.art}${variant ? '-warm' : ''}.svg`,
      media: photo ? 'photo' : 'illustration',
      variant,
      ...demoSourceSize[photo ? 'photo' : 'illustration'],
    }));
  }
}
