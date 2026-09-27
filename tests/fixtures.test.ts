import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { XMLValidator } from 'fast-xml-parser';
import { MockStudio } from '@wishscene/domain';
import { MockImageProvider } from '@wishscene/providers';
import { demoPresets, demoPreview, hasPhotoPreset } from '@wishscene/contracts';
import { createHash } from 'node:crypto';

it('every destination and candidate grade resolves to a well-formed bundled SVG', () => {
  const studio = new MockStudio();
  const provider = new MockImageProvider();
  for (const destination of ['Tokyo', 'Kyoto', 'Amalfi', 'Iceland'] as const) {
    const exp = studio.create({
      title: 'Fixture audit',
      destination,
      outfit: 'Demo outfit',
      mood: 'Adventure',
    });
    for (const scene of exp.scenes) {
      for (const asset of provider.candidates({
        jobId: 'fixture',
        scene,
        story: exp,
        bibleVersion: 1,
        createdAt: exp.createdAt,
      })) {
        const content = readFileSync(resolve('apps/web/public', asset.image.slice(1)), 'utf8');
        expect(XMLValidator.validate(content), asset.image).toBe(true);
        expect(content).toContain('viewBox="0 0 600 800"');
        expect(content).toContain('WISHSCENE / ILLUSTRATED DEMO');
      }
    }
  }
});

it('all 16 matching photo presets resolve to distinct complete JPEGs, including previews and exports', () => {
  let now = 0;
  let id = 0;
  const studio = new MockStudio(
    () => now,
    () => `photo-${++id}`,
  );
  const hashes = new Set<string>();
  for (const destination of ['Tokyo', 'Kyoto', 'Amalfi', 'Iceland'] as const) {
    const { outfit, mood } = demoPresets[destination];
    const exp = studio.create({ title: 'Photo audit', destination, outfit, mood });
    expect(hasPhotoPreset(exp)).toBe(true);
    expect(hasPhotoPreset({ ...exp, outfit: 'Different clothing' })).toBe(false);
    expect(
      hasPhotoPreset({ ...exp, mood: mood === 'Adventure' ? 'After hours' : 'Adventure' }),
    ).toBe(false);
    for (const scene of exp.scenes)
      studio.generate(exp.id, scene.id, { requestKey: scene.id, scenario: 'success' });
    now += 2500;
    const ready = studio.snapshot().experiences.find((item) => item.id === exp.id)!;
    for (const scene of ready.scenes) {
      const [asset] = scene.assets;
      expect(asset.media).toBe('photo');
      expect(demoPreview(exp, scene)).toBe(asset.image);
      const bytes = readFileSync(resolve('apps/web/public', asset.image.slice(1)));
      expect(bytes.length).toBeGreaterThan(25000);
      expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
      expect(bytes.subarray(-2).toString('hex')).toBe('ffd9');
      hashes.add(createHash('sha256').update(bytes).digest('hex'));
      studio.approve(exp.id, scene.id, asset.id, 1);
    }
    const manifest = studio.export(exp.id);
    expect(manifest.assets.every((asset) => asset.filename.endsWith('.jpg'))).toBe(true);
    expect(manifest.provenance).toContain('fictional Alex Morgan');
  }
  expect(hashes.size).toBe(16);
});
