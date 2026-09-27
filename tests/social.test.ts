import { describe, expect, it } from 'vitest';
import { MockStudio } from '@wishscene/domain';
import {
  socialPlatformSchema,
  socialPlatforms,
  socialUpdate,
  suggestSocialCopy,
  type SocialUpdate,
} from '@wishscene/contracts';

const exp = 'tokyo-after-hours';
const first = `${exp}-scene-1`;
const second = `${exp}-scene-2`;
const input = (overrides: Partial<SocialUpdate> = {}): SocialUpdate => ({
  expectedVersion: 1,
  expectedRevision: 0,
  platform: 'instagram-story',
  draft: {
    caption: 'My imagined Tokyo evening.',
    overlayText: 'Another kind of night',
    tone: 'cinematic',
  },
  ...overrides,
});

describe('per-image social drafts', () => {
  it('saves platforms independently, isolates images and snapshots, and rejects concurrent writes', () => {
    const studio = new MockStudio();
    studio.updateSocial(exp, first, input());
    studio.updateSocial(
      exp,
      first,
      input({
        expectedRevision: 1,
        platform: 'x',
        draft: { caption: 'A shorter daydream.', overlayText: '', tone: 'understated' },
      }),
    );
    studio.updateSocial(
      exp,
      second,
      input({
        platform: 'linkedin',
        draft: { caption: 'A visual design study.', overlayText: '', tone: 'understated' },
      }),
    );
    const scenes = studio.snapshot().experiences[0].scenes;
    expect(scenes[0].social.platform).toBe('x');
    expect(scenes[0].social.drafts['instagram-story'].caption).toBe('My imagined Tokyo evening.');
    expect(scenes[0].social.drafts.x.caption).toBe('A shorter daydream.');
    expect(scenes[1].social.drafts.linkedin.caption).toBe('A visual design study.');
    expect(scenes[1].social.drafts.x.caption).not.toBe('A shorter daydream.');
    expect(() => studio.updateSocial(exp, first, input())).toThrow('another tab');
    scenes[0].social.drafts.x.caption = 'Changed outside store';
    expect(studio.snapshot().experiences[0].scenes[0].social.drafts.x.caption).toBe(
      'A shorter daydream.',
    );
    expect(new MockStudio().snapshot().experiences[0].scenes[0].social.revision).toBe(0);
  });

  it('preserves copy after a story edit but rejects old-version saves and old-image exports', () => {
    const studio = new MockStudio();
    studio.updateSocial(exp, first, input());
    studio.updateStory(exp, { expectedVersion: 1, outfit: 'Blue linen suit', mood: 'Adventure' });
    expect(() => studio.updateSocial(exp, first, input({ expectedRevision: 1 }))).toThrow(
      'story changed',
    );
    expect(
      studio.snapshot().experiences[0].scenes[0].social.drafts['instagram-story'].overlayText,
    ).toBe('Another kind of night');
    expect(() => studio.export(exp)).toThrow('Approve every scene');
    expect(() => studio.updateSocial('amalfi-postcards', first, input())).toThrow(
      'Scene not found',
    );
  });

  it('exports each selected draft with its own approved asset and never includes another platform’s text', () => {
    let now = 0;
    const studio = new MockStudio(() => now);
    studio.updateSocial(exp, first, input());
    studio.updateSocial(
      exp,
      second,
      input({
        platform: 'linkedin',
        draft: { caption: 'Creative process.', overlayText: '', tone: 'understated' },
      }),
    );
    studio.generate(exp, `${exp}-scene-4`, {
      requestKey: 'social-export-001',
      scenario: 'success',
    });
    now += 2500;
    for (const scene of studio.snapshot().experiences[0].scenes)
      studio.approve(exp, scene.id, scene.assets[0].id, 1);
    const manifest = studio.export(exp);
    expect(manifest.assets[0].social).toMatchObject({
      platform: 'instagram-story',
      caption: 'My imagined Tokyo evening.',
      previewAspectRatio: '9:16',
      previewOnly: true,
    });
    expect(manifest.assets[1].social).toMatchObject({
      platform: 'linkedin',
      caption: 'Creative process.',
      previewAspectRatio: '1:1',
    });
    expect(manifest.assets[0].sceneId).toBe(first);
    expect(manifest.assets[0].image).toBe('/demo/photos/tokyo-neon.jpg');
    expect(manifest.assets[2].social.platform).toBe('instagram');
  });

  it('validates every format’s budget, preserves literal text, and provides fitting scene-specific templates', () => {
    const studio = new MockStudio();
    for (const experience of studio.snapshot().experiences) {
      for (const scene of experience.scenes) {
        for (const platform of socialPlatformSchema.options) {
          for (const tone of ['playful', 'understated', 'cinematic'] as const) {
            const draft = suggestSocialCopy(experience, scene, platform, tone);
            expect(draft.caption).toContain(experience.destination);
            expect(draft.caption).toContain(scene.title);
            expect(socialUpdate.safeParse(input({ platform, draft })).success).toBe(true);
          }
          expect(
            socialUpdate.safeParse(
              input({
                platform,
                draft: {
                  ...input().draft,
                  caption: 'a'.repeat(socialPlatforms[platform].draftLimit + 1),
                },
              }),
            ).success,
          ).toBe(false);
        }
      }
    }
    expect(socialUpdate.safeParse({ ...input(), platform: 'unknown' }).success).toBe(false);
    expect(socialUpdate.safeParse({ ...input(), extra: true }).success).toBe(false);
    expect(
      socialUpdate.safeParse(input({ draft: { ...input().draft, overlayText: 'x'.repeat(81) } }))
        .success,
    ).toBe(false);
    const raw = '<b>שלום Tokyo</b> ✨';
    expect(
      studio.updateSocial(exp, first, input({ draft: { ...input().draft, caption: raw } })).drafts[
        'instagram-story'
      ].caption,
    ).toBe(raw);
  });
});
