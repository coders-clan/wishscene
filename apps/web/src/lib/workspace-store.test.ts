import { afterAll, describe, expect, it } from 'vitest';
import { postgresPool } from './postgres';
import { withPostgresWorkspace } from './workspace-store';
describe.skipIf(!process.env.WISHSCENE_TEST_PG_URL)('Postgres demo workspaces', () => {
  const pool = process.env.WISHSCENE_TEST_PG_URL
    ? postgresPool(process.env.WISHSCENE_TEST_PG_URL)
    : null;
  afterAll(async () => {
    await pool?.end();
  });
  it('restores approvals and social drafts in a fresh domain instance and isolates browser sessions', async () => {
    const first = await withPostgresWorkspace(pool!, undefined, async (studio) =>
      studio.snapshot(),
    );
    const exp = first.value.experiences[0],
      scene = exp.scenes[0];
    await withPostgresWorkspace(pool!, first.sessionId, async (studio) =>
      studio.updateSocial(exp.id, scene.id, {
        expectedVersion: 1,
        expectedRevision: 0,
        platform: 'x',
        draft: { caption: 'Saved in Neon', overlayText: '', tone: 'playful' },
      }),
    );
    const restored = await withPostgresWorkspace(pool!, first.sessionId, async (studio) =>
      studio.snapshot(),
    );
    expect(restored.value.experiences[0].scenes[0].social.drafts.x.caption).toBe('Saved in Neon');
    expect(restored.value.experiences[0].scenes[0].approvedAssetId).toBe(scene.approvedAssetId);
    const other = await withPostgresWorkspace(pool!, undefined, async (studio) =>
      studio.snapshot(),
    );
    expect(other.value.experiences[0].scenes[0].social.revision).toBe(0);
  });
  it('serializes concurrent writes and rejects stale versions without losing the winning update', async () => {
    const first = await withPostgresWorkspace(pool!, undefined, async (studio) =>
      studio.snapshot(),
    );
    const exp = first.value.experiences[0];
    const results = await Promise.allSettled(
      ['Linen shirt', 'Blue jacket'].map((outfit) =>
        withPostgresWorkspace(pool!, first.sessionId, async (studio) =>
          studio.updateStory(exp.id, { expectedVersion: 1, outfit, mood: 'Adventure' }),
        ),
      ),
    );
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((x) => x.status === 'rejected')).toHaveLength(1);
    const after = await withPostgresWorkspace(pool!, first.sessionId, async (studio) =>
      studio.snapshot(),
    );
    expect(after.value.experiences[0].bibleVersion).toBe(2);
    expect(after.value.experiences[0].scenes.every((x) => !x.approvedAssetId)).toBe(true);
  });
  it('rolls back failed mutations and replaces an expired session', async () => {
    const first = await withPostgresWorkspace(pool!, undefined, async (studio) =>
      studio.snapshot(),
    );
    await expect(
      withPostgresWorkspace(pool!, first.sessionId, async (studio) => {
        studio.caption(first.value.experiences[0].id, 'Should roll back');
        throw new Error('Interrupted');
      }),
    ).rejects.toThrow('Interrupted');
    const current = await withPostgresWorkspace(pool!, first.sessionId, async (studio) =>
      studio.snapshot(),
    );
    expect(current.value.experiences[0].caption).not.toBe('Should roll back');
    await pool!.query('UPDATE wishscene_demo_workspaces SET expires = 0 WHERE id = $1', [
      first.sessionId,
    ]);
    const expired = await withPostgresWorkspace(pool!, first.sessionId, async (studio) =>
      studio.snapshot(),
    );
    expect(expired.sessionId).not.toBe(first.sessionId);
  });
});
