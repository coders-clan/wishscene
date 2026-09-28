import { describe, expect, it } from 'vitest';
import { DomainError, MockStudio } from '@wishscene/domain';
import {
  cropAxis,
  demoSourceSize,
  exportFrame,
  packUpdate,
  socialPlatformSchema,
  socialPlatforms,
  type Workspace,
} from '@wishscene/contracts';

const exp = 'tokyo-after-hours';
const scene = (n: number) => `${exp}-scene-${n}`;

function approvedStudio() {
  let now = 0;
  const studio = new MockStudio(() => now);
  studio.generate(exp, scene(4), { requestKey: 'pack-export-0001', scenario: 'success' });
  now += 2500;
  for (const item of studio.snapshot().experiences[0].scenes)
    studio.approve(exp, item.id, item.assets[0].id, 1);
  return studio;
}

describe('export crop geometry', () => {
  it('matches each format exactly, never upscales, and keeps the crop inside the source', () => {
    for (const source of Object.values(demoSourceSize))
      for (const platform of socialPlatformSchema.options)
        for (const focus of [
          { x: 0, y: 0 },
          { x: 50, y: 45 },
          { x: 100, y: 100 },
        ]) {
          const { aspect, output } = socialPlatforms[platform];
          const frame = exportFrame(source, platform, focus);
          expect(frame.width * aspect[1]).toBe(frame.height * aspect[0]);
          expect(frame.width).toBeLessThanOrEqual(output.width);
          expect(frame.width).toBeLessThanOrEqual(frame.crop.width + 0.01);
          expect(frame.crop.width / frame.crop.height).toBeCloseTo(aspect[0] / aspect[1], 3);
          expect(frame.crop.x).toBeGreaterThanOrEqual(0);
          expect(frame.crop.y).toBeGreaterThanOrEqual(0);
          expect(frame.crop.x + frame.crop.width).toBeLessThanOrEqual(source.width + 0.01);
          expect(frame.crop.y + frame.crop.height).toBeLessThanOrEqual(source.height + 0.01);
        }
  });

  it('produces the documented photo sizes and moves only the trimmed axis', () => {
    const photo = demoSourceSize.photo;
    const size = (platform: Parameters<typeof exportFrame>[1]) => {
      const { width, height } = exportFrame(photo, platform, { x: 50, y: 50 });
      return `${width}x${height}`;
    };
    expect(size('instagram')).toBe('1080x1350');
    expect(size('facebook')).toBe('1080x1080');
    expect(size('instagram-story')).toBe('810x1440');
    expect(size('x')).toBe('1072x603');
    expect(cropAxis(photo, 'instagram')).toBe('y');
    expect(cropAxis(photo, 'tiktok')).toBe('x');
    expect(cropAxis({ width: 800, height: 1000 }, 'instagram')).toBeNull();
    const top = exportFrame(photo, 'instagram', { x: 50, y: 0 }).crop;
    const bottom = exportFrame(photo, 'instagram', { x: 50, y: 100 }).crop;
    expect(top).toMatchObject({ x: 0, y: 0 });
    expect(bottom.y + bottom.height).toBeCloseTo(photo.height, 1);
    const left = exportFrame(photo, 'tiktok', { x: 0, y: 50 }).crop;
    expect(left).toMatchObject({ x: 0, y: 0 });
  });
});

describe('carousel pack', () => {
  it('saves order and cover title with revision checks and keeps the Story Bible version', () => {
    const studio = new MockStudio();
    const order = [scene(3), scene(1), scene(2), scene(4)];
    const pack = studio.updatePack(exp, {
      expectedRevision: 0,
      order,
      coverTitle: '  לילה בטוקיו  ',
    });
    expect(pack).toEqual({ order, coverTitle: 'לילה בטוקיו', revision: 1 });
    const saved = studio.snapshot().experiences[0];
    expect(saved.pack).toEqual(pack);
    expect(saved.bibleVersion).toBe(1);
    expect(saved.scenes.filter((item) => item.status === 'approved')).toHaveLength(2);
    expect(() => studio.updatePack(exp, { expectedRevision: 0, order, coverTitle: '' })).toThrow(
      'another tab',
    );
  });

  it('rejects orders that drop, repeat or borrow scenes without changing the pack', () => {
    const studio = new MockStudio();
    const before = studio.snapshot().experiences[0].pack;
    for (const order of [
      [scene(1), scene(2), scene(3)],
      [scene(1), scene(1), scene(2), scene(3)],
      [scene(1), scene(2), scene(3), 'amalfi-postcards-scene-1'],
    ]) {
      const attempt = () => studio.updatePack(exp, { expectedRevision: 0, order, coverTitle: '' });
      expect(attempt).toThrow(DomainError);
      expect(attempt).toThrow('every scene exactly once');
    }
    expect(studio.snapshot().experiences[0].pack).toEqual(before);
    expect(packUpdate.safeParse({ expectedRevision: 0, order: [], coverTitle: '' }).success).toBe(
      false,
    );
    expect(
      packUpdate.safeParse({ expectedRevision: 0, order: [scene(1)], coverTitle: 'x'.repeat(65) })
        .success,
    ).toBe(false);
    expect(
      packUpdate.safeParse({ expectedRevision: 0, order: [scene(1)], coverTitle: '', x: 1 })
        .success,
    ).toBe(false);
  });

  it('exports in carousel order with a cover, crop focus and exact output sizes', () => {
    const studio = approvedStudio();
    studio.updateSocial(exp, scene(4), {
      expectedVersion: 1,
      expectedRevision: 0,
      platform: 'tiktok',
      draft: { caption: 'Night walk.', overlayText: 'Home, the long way', tone: 'cinematic' },
      focus: { x: 20, y: 45 },
    });
    studio.updatePack(exp, {
      expectedRevision: 0,
      order: [scene(4), scene(2), scene(3), scene(1)],
      coverTitle: 'Tokyo after dark',
    });
    const manifest = studio.export(exp);
    expect(manifest.schema).toBe('wishscene.mock-export/2');
    expect(manifest.coverTitle).toBe('Tokyo after dark');
    expect(manifest.assets.map((asset) => asset.sceneId)).toEqual([
      scene(4),
      scene(2),
      scene(3),
      scene(1),
    ]);
    expect(manifest.assets.map((asset) => [asset.position, asset.cover])).toEqual([
      [1, true],
      [2, false],
      [3, false],
      [4, false],
    ]);
    const [cover, second] = manifest.assets;
    expect(cover.social).toMatchObject({ platform: 'tiktok', focus: { x: 20, y: 45 } });
    expect(cover.output).toEqual({
      ...exportFrame(demoSourceSize.photo, 'tiktok', { x: 20, y: 45 }),
      filename: 'images/01-street-tiktok.jpg',
      type: 'image/jpeg',
      aspectRatio: '9:16',
    });
    expect(cover.filename).toBe('originals/01-street-variant-1.jpg');
    expect(second.output).toMatchObject({ width: 1080, height: 1350, aspectRatio: '4:5' });
    expect(new Set(manifest.assets.map((asset) => asset.output.filename)).size).toBe(4);
  });
});

describe('saved workspaces from before carousel support', () => {
  it('load with default order, cover title, focus and asset sizes', () => {
    const legacy = structuredClone(approvedStudio().snapshot()) as unknown as {
      experiences: Array<{
        pack?: unknown;
        scenes: Array<{ social: { focus?: unknown }; assets: Array<Record<string, unknown>> }>;
      }>;
    };
    for (const experience of legacy.experiences) {
      delete experience.pack;
      for (const item of experience.scenes) {
        delete item.social.focus;
        for (const asset of item.assets) {
          delete asset.width;
          delete asset.height;
        }
      }
    }
    const studio = MockStudio.restore(legacy as unknown as Workspace);
    const restored = studio.snapshot().experiences[0];
    expect(restored.pack).toEqual({
      order: [scene(1), scene(2), scene(3), scene(4)],
      coverTitle: 'Tokyo, after hours',
      revision: 0,
    });
    expect(restored.scenes[0].social.focus).toEqual({ x: 50, y: 45 });
    expect(restored.scenes[0].assets[0]).toMatchObject(demoSourceSize.photo);
    expect(studio.export(exp).assets[0].output).toMatchObject({ width: 1080, height: 1350 });
  });
});
