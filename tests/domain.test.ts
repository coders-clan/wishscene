import { describe, expect, it } from 'vitest';
import { DomainError, MockStudio } from '@wishscene/domain';
import { experienceInput } from '@wishscene/contracts';

function fixture() {
  let time = Date.parse('2026-01-01T12:00:00Z');
  let sequence = 0;
  const studio = new MockStudio(
    () => time,
    () => `test-${++sequence}`,
  );
  return {
    studio,
    advance: (ms = 2500) => {
      time += ms;
    },
    exp: 'tokyo-after-hours',
    scene: 'tokyo-after-hours-scene-4',
  };
}
const request = (
  requestKey = 'request-key-001',
  scenario: 'success' | 'slow' | 'failure' = 'success',
) => ({ requestKey, scenario });

describe('mock studio lifecycle', () => {
  it('provides deterministic starter states and isolated copies', () => {
    const { studio } = fixture();
    const data = studio.snapshot();
    expect(data.experiences).toHaveLength(3);
    expect(data.experiences[0].scenes.map((x) => x.status)).toEqual([
      'approved',
      'approved',
      'review',
      'draft',
    ]);
    data.experiences[0].title = 'Changed outside the store';
    expect(studio.snapshot().experiences[0].title).toBe('Tokyo, after hours');
  });
  it('transitions queued to running to review using the injected clock', () => {
    const { studio, advance, exp, scene } = fixture();
    studio.generate(exp, scene, request());
    expect(studio.snapshot().jobs[0].status).toBe('queued');
    advance(400);
    expect(studio.snapshot().jobs[0].status).toBe('running');
    advance();
    const result = studio.snapshot().experiences[0].scenes[3];
    expect(result.status).toBe('review');
    expect(result.assets).toHaveLength(2);
    expect(result.assets[0].image).not.toBe(result.assets[1].image);
  });
  it('makes retries idempotent and rejects reuse with different input', () => {
    const { studio, exp, scene } = fixture();
    const first = studio.generate(exp, scene, request());
    expect(studio.generate(exp, scene, request()).id).toBe(first.id);
    expect(studio.snapshot().jobs).toHaveLength(1);
    expect(() => studio.generate(exp, scene, request('request-key-001', 'slow'))).toThrow(
      'new request key',
    );
    expect(() => studio.generate(exp, scene, request('another-key-001'))).toThrow(
      'already generating',
    );
  });
  it('cancels pending work and never appends cancelled results', () => {
    const { studio, advance, exp, scene } = fixture();
    const job = studio.generate(exp, scene, request('slow-key-001', 'slow'));
    advance();
    expect(studio.snapshot().jobs[0].status).toBe('running');
    studio.cancel(job.id);
    advance(20000);
    expect(studio.snapshot().jobs[0].status).toBe('cancelled');
    expect(studio.snapshot().experiences[0].scenes[3].assets).toHaveLength(0);
    expect(studio.snapshot().experiences[0].scenes[3].status).toBe('draft');
  });
  it('preserves approved choices when a regeneration fails, then supports retry', () => {
    const { studio, advance, exp } = fixture();
    const scene = `${exp}-scene-1`;
    const original = studio.snapshot().experiences[0].scenes[0].approvedAssetId;
    studio.generate(exp, scene, request('failure-key-001', 'failure'));
    advance();
    expect(studio.snapshot().jobs[0].status).toBe('failed');
    expect(studio.snapshot().experiences[0].scenes[0].approvedAssetId).toBe(original);
    studio.generate(exp, scene, request('retry-key-002'));
    advance();
    expect(studio.snapshot().experiences[0].scenes[0].status).toBe('review');
  });
  it('invalidates approvals, rejects old candidates and cancels jobs after a story edit', () => {
    const { studio, advance, exp, scene } = fixture();
    const oldAsset = studio.snapshot().experiences[0].scenes[0].assets[0];
    studio.generate(exp, scene, request());
    studio.updateStory(exp, { expectedVersion: 1, outfit: 'Amber parka', mood: 'Adventure' });
    advance(20000);
    const data = studio.snapshot();
    expect(data.jobs[0].status).toBe('cancelled');
    expect(data.experiences[0].bibleVersion).toBe(2);
    expect(data.experiences[0].scenes.every((x) => x.approvedAssetId === null)).toBe(true);
    expect(data.experiences[0].scenes[0].status).toBe('stale');
    expect(data.experiences[0].scenes[3].assets).toHaveLength(0);
    expect(() => studio.approve(exp, oldAsset.sceneId, oldAsset.id, 2)).toThrow('older story');
    expect(() =>
      studio.updateStory(exp, { expectedVersion: 1, outfit: 'Blue coat', mood: 'Adventure' }),
    ).toThrow('story changed');
    expect(() => studio.export(exp)).toThrow('Approve every scene');
  });
  it('keeps the version and approvals on a no-op edit', () => {
    const { studio, exp } = fixture();
    const current = studio.snapshot().experiences[0];
    studio.updateStory(exp, { expectedVersion: 1, outfit: current.outfit, mood: current.mood });
    expect(studio.snapshot().experiences[0].bibleVersion).toBe(1);
    expect(studio.snapshot().experiences[0].scenes[0].status).toBe('approved');
  });
  it('requires current approvals for a complete export manifest', () => {
    const { studio, exp, scene, advance } = fixture();
    expect(() => studio.export(exp)).toThrow('Approve every scene');
    studio.generate(exp, scene, request());
    advance();
    for (const item of studio.snapshot().experiences[0].scenes)
      studio.approve(exp, item.id, item.assets[0].id, 1);
    studio.caption(exp, 'Custom caption');
    const manifest = studio.export(exp);
    expect(manifest.mock).toBe(true);
    expect(manifest.assets).toHaveLength(4);
    expect(manifest.caption).toBe('Custom caption');
    expect(manifest.assets.every((x) => x.bibleVersion === 1)).toBe(true);
    expect(new Set(manifest.assets.map((x) => x.filename)).size).toBe(4);
    studio.updateStory(exp, { expectedVersion: 1, outfit: 'Blue suit', mood: 'Slow living' });
    expect(() => studio.export(exp)).toThrow('Approve every scene');
  });
  it('rejects foreign IDs and keeps independent workspaces separate', () => {
    const { studio } = fixture();
    const other = fixture().studio;
    const created = studio.create({
      title: 'New adventure',
      destination: 'Kyoto',
      outfit: 'Blue jacket',
      mood: 'Slow living',
    });
    expect(() => other.export(created.id)).toThrow(DomainError);
    expect(() => studio.generate(created.id, 'tokyo-after-hours-scene-1', request())).toThrow(
      'Scene not found',
    );
    studio.reset();
    expect(studio.snapshot().experiences).toHaveLength(3);
  });
  it('rejects unsupported destination, extra properties and unbounded text at the contract', () => {
    expect(
      experienceInput.safeParse({
        title: 'Hi',
        destination: 'Mars',
        outfit: 'Jacket',
        mood: 'Adventure',
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      experienceInput.safeParse({
        title: 'A'.repeat(65),
        destination: 'Tokyo',
        outfit: 'Jacket',
        mood: 'Adventure',
      }).success,
    ).toBe(false);
  });
});
