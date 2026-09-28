import { describe, expect, it } from 'vitest';
import { DomainError, MockStudio } from '@wishscene/domain';
import {
  cropAxis,
  cropPoint,
  demoSourceSize,
  exportFrame,
  focusAt,
  maxSocialZoom,
  packUpdate,
  socialPlatformSchema,
  socialPlatforms,
  socialUpdate,
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
          { x: 0, y: 0, zoom: 1 },
          { x: 50, y: 45, zoom: 1 },
          { x: 100, y: 100, zoom: 1 },
          { x: 0, y: 100, zoom: 2 },
          { x: 37.5, y: 62.25, zoom: maxSocialZoom },
          { x: 100, y: 0, zoom: maxSocialZoom },
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
      const { width, height } = exportFrame(photo, platform, { x: 50, y: 50, zoom: 1 });
      return `${width}x${height}`;
    };
    expect(size('instagram')).toBe('1080x1350');
    expect(size('facebook')).toBe('1080x1080');
    expect(size('instagram-story')).toBe('810x1440');
    expect(size('x')).toBe('1072x603');
    expect(cropAxis(photo, 'instagram')).toBe('y');
    expect(cropAxis(photo, 'tiktok')).toBe('x');
    expect(cropAxis({ width: 800, height: 1000 }, 'instagram')).toBeNull();
    const top = exportFrame(photo, 'instagram', { x: 50, y: 0, zoom: 1 }).crop;
    const bottom = exportFrame(photo, 'instagram', { x: 50, y: 100, zoom: 1 }).crop;
    expect(top).toMatchObject({ x: 0, y: 0 });
    expect(bottom.y + bottom.height).toBeCloseTo(photo.height, 1);
    const left = exportFrame(photo, 'tiktok', { x: 0, y: 50, zoom: 1 }).crop;
    expect(left).toMatchObject({ x: 0, y: 0 });
  });

  it('zooms into a smaller crop and lowers the export size instead of upscaling', () => {
    const photo = demoSourceSize.photo;
    const whole = exportFrame(photo, 'instagram', { x: 50, y: 50, zoom: 1 });
    const zoomed = exportFrame(photo, 'instagram', { x: 50, y: 50, zoom: 2 });
    expect(zoomed.crop.width).toBeCloseTo(whole.crop.width / 2, 1);
    expect(zoomed.crop.x + zoomed.crop.width / 2).toBeCloseTo(photo.width / 2, 1);
    expect(`${zoomed.width}x${zoomed.height}`).toBe('540x675');
    const corner = exportFrame(photo, 'instagram', { x: 100, y: 100, zoom: maxSocialZoom }).crop;
    expect(corner.x + corner.width).toBeCloseTo(photo.width, 1);
    expect(corner.y + corner.height).toBeCloseTo(photo.height, 1);
  });

  it('keeps the image point under a drag or pinch there, and stops at the edges', () => {
    const photo = demoSourceSize.photo;
    const start = { x: 50, y: 45, zoom: 1 };
    const face = cropPoint(photo, 'instagram', start, { x: 0.5, y: 0.2 });
    // Pinch to 2x around the face, then drag it further down the frame.
    const pinched = focusAt(photo, 'instagram', start, 2, face, { x: 0.5, y: 0.2 });
    expect(pinched.zoom).toBe(2);
    const moved = cropPoint(photo, 'instagram', pinched, { x: 0.5, y: 0.2 });
    expect(moved.x).toBeCloseTo(face.x, 0);
    expect(moved.y).toBeCloseTo(face.y, 0);
    const dragged = focusAt(photo, 'instagram', pinched, 2, face, { x: 0.5, y: 0.35 });
    expect(cropPoint(photo, 'instagram', dragged, { x: 0.5, y: 0.35 }).y).toBeCloseTo(face.y, 0);
    // Centering it would need image above the photo's top edge, so the crop stops there.
    expect(focusAt(photo, 'instagram', pinched, 2, face, { x: 0.5, y: 0.5 }).y).toBe(0);
    // A 3:4 photo fills 4:5 across, so at 1x only the vertical position can change.
    expect(focusAt(photo, 'instagram', start, 1, face, { x: 0.9, y: 5 })).toEqual({
      x: 50,
      y: 0,
      zoom: 1,
    });
    expect(focusAt(photo, 'instagram', start, 10, face, { x: 0.5, y: 0.5 }).zoom).toBe(
      maxSocialZoom,
    );
    expect(focusAt(photo, 'instagram', start, 0.2, face, { x: 0.5, y: 0.5 }).zoom).toBe(1);
  });

  it('accepts saves without a zoom as 1x and rejects zoom outside 1–3', () => {
    const input = (focus: unknown) => ({
      expectedVersion: 1,
      expectedRevision: 0,
      platform: 'instagram',
      draft: { caption: 'Hi', overlayText: '', tone: 'playful' },
      focus,
    });
    expect(socialUpdate.parse(input({ x: 12.5, y: 40 })).focus).toEqual({
      x: 12.5,
      y: 40,
      zoom: 1,
    });
    for (const focus of [
      { x: 50, y: 50, zoom: 0.5 },
      { x: 50, y: 50, zoom: 3.5 },
      { x: 50, y: 101, zoom: 1 },
      { x: 50, y: 50, zoom: 1, scale: 2 },
    ])
      expect(socialUpdate.safeParse(input(focus)).success).toBe(false);
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
      focus: { x: 20, y: 45, zoom: 1.5 },
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
    expect(cover.social).toMatchObject({
      platform: 'tiktok',
      focus: { x: 20, y: 45, zoom: 1.5 },
    });
    expect(cover.output).toEqual({
      ...exportFrame(demoSourceSize.photo, 'tiktok', { x: 20, y: 45, zoom: 1.5 }),
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
        scenes: Array<{
          social: { focus?: { x: number; y: number; zoom?: number } };
          assets: Array<Record<string, unknown>>;
        }>;
      }>;
    };
    for (const experience of legacy.experiences) {
      delete experience.pack;
      for (const [index, item] of experience.scenes.entries()) {
        // The first scene predates crop focus; the second saved a focus before zoom existed.
        if (index === 0) delete item.social.focus;
        else item.social.focus = { x: 30, y: 70 };
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
    expect(restored.scenes[0].social.focus).toEqual({ x: 50, y: 45, zoom: 1 });
    expect(restored.scenes[1].social.focus).toEqual({ x: 30, y: 70, zoom: 1 });
    expect(restored.scenes[0].assets[0]).toMatchObject(demoSourceSize.photo);
    expect(studio.export(exp).assets[0].output).toMatchObject({ width: 1080, height: 1350 });
  });
});
