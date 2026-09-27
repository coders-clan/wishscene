import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { XMLValidator } from 'fast-xml-parser';
import { MockStudio } from '@wishscene/domain';
import { MockImageProvider } from '@wishscene/providers';

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
