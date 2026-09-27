import type { Asset, Scene } from '@wishscene/contracts';

export interface ImageProvider {
  candidates(input: {
    jobId: string;
    scene: Scene;
    bibleVersion: number;
    createdAt: string;
  }): Asset[];
}

/** Pure fixture adapter. No network, credentials, or personal images. */
export class MockImageProvider implements ImageProvider {
  candidates({
    jobId,
    scene,
    bibleVersion,
    createdAt,
  }: Parameters<ImageProvider['candidates']>[0]): Asset[] {
    return [0, 1].map((variant) => ({
      id: `${jobId}-candidate-${variant}`,
      sceneId: scene.id,
      bibleVersion,
      createdAt,
      image: `/demo/${scene.art}${variant ? '-warm' : ''}.svg`,
      variant,
    }));
  }
}
