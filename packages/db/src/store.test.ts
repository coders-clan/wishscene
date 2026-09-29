import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isTransientDbError,
  ownerStore,
  Prisma,
  pruneThrottles,
  publishCandidate,
  takeThrottle,
  THROTTLE_MAX_WINDOW_MS,
  transientDbErrorCode,
  withPurge,
  type OwnerStore,
  type PrismaClient,
} from './index';
import { createTestDatabase, runPrisma } from './testing';

const input = {
  title: 'Tokyo nights',
  destination: 'Tokyo',
  outfit: 'Black wool coat',
  mood: 'After hours',
} as const;
const key = () => `o/${randomBytes(32).toString('base64url')}`;
const notFound = { status: 404, code: 'NOT_FOUND' };

it('treats only failures that surely did not write as retryable', () => {
  const known = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: '7.10.0' });
  for (const code of ['P1001', 'P2028', 'P2034', 'P2037'])
    expect(transientDbErrorCode(known(code))).toBe(code);
  // A connection lost mid-query may have committed.
  for (const code of ['P1008', 'P1017', 'P2002'])
    expect(isTransientDbError(known(code))).toBe(false);
  expect(transientDbErrorCode(new Error('timeout exceeded when trying to connect'))).toBe(
    'POOL_TIMEOUT',
  );
  expect(isTransientDbError(new Error('P2028'))).toBe(false);
});

describe.skipIf(!process.env.WISHSCENE_TEST_PG_URL)('product store (Postgres)', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let prisma: PrismaClient;
  beforeAll(async () => {
    db = await createTestDatabase();
    prisma = db.prisma;
  }, 120_000);
  afterAll(async () => {
    await db?.drop();
  });

  async function user() {
    const id = randomUUID();
    await prisma.user.create({ data: { id, name: 'Test', email: `${id}@example.test` } });
    return ownerStore(prisma, id);
  }
  async function candidate(store: OwnerStore, experienceId: string, sceneId: string) {
    const { job } = await store.requestGeneration(experienceId, sceneId, randomUUID());
    const { assetId } = await publishCandidate(prisma, {
      jobId: job.id,
      objectKey: key(),
      contentType: 'image/png',
    });
    return assetId;
  }
  async function approveAll(store: OwnerStore, experienceId: string) {
    const experience = await store.getExperience(experienceId);
    for (const scene of experience.scenes)
      await store.approveAsset(
        await candidate(store, experienceId, scene.id),
        experience.bibleVersion,
      );
  }

  it('creates an experience with Story Bible v1 and four planned scenes', async () => {
    const store = await user();
    const experience = await store.createExperience(input);
    expect(experience).toMatchObject({
      title: input.title,
      bibleVersion: 1,
      bible: {
        version: 1,
        parentVersion: null,
        facts: { destination: 'Tokyo', outfit: input.outfit, mood: input.mood },
      },
    });
    expect(experience.scenes.map((scene) => scene.title)).toEqual([
      'Neon kind of night',
      'A table for daydreams',
      'Above the ordinary',
      'The long way home',
    ]);
    expect(await store.listExperiences()).toHaveLength(1);
  });

  it('denies every cross-account read and write with 404', async () => {
    const alice = await user();
    const bob = await user();
    const experience = await alice.createExperience(input);
    const scene = experience.scenes[0];
    const { job } = await alice.requestGeneration(experience.id, scene.id, randomUUID());
    const { assetId } = await publishCandidate(prisma, {
      jobId: job.id,
      objectKey: key(),
      contentType: 'image/png',
    });
    const upload = await alice.initUpload({
      contentType: 'image/png',
      byteSize: 1000,
      objectKey: key(),
    });
    const { job: pending } = await alice.requestGeneration(experience.id, scene.id, randomUUID());

    await expect(bob.getExperience(experience.id)).rejects.toMatchObject(notFound);
    await expect(
      bob.editBible(experience.id, { expectedVersion: 1, outfit: 'Red dress', mood: 'Adventure' }),
    ).rejects.toMatchObject(notFound);
    await expect(
      bob.requestGeneration(experience.id, scene.id, randomUUID()),
    ).rejects.toMatchObject(notFound);
    await expect(bob.getJob(job.id)).rejects.toMatchObject(notFound);
    await expect(bob.cancelJob(pending.id)).rejects.toMatchObject(notFound);
    await expect(bob.approveAsset(assetId, 1)).rejects.toMatchObject(notFound);
    await expect(bob.createExport(experience.id, 1)).rejects.toMatchObject(notFound);
    await expect(bob.assetForDownload(assetId)).rejects.toMatchObject(notFound);
    await expect(bob.uploadObjectKey(upload.id)).rejects.toMatchObject(notFound);
    await expect(
      bob.completeUpload(upload.id, { byteSize: 1000, contentType: 'image/png', etag: '"a"' }),
    ).rejects.toMatchObject(notFound);
    await expect(bob.getExperience('not-a-uuid')).rejects.toMatchObject(notFound);
    expect(await bob.listExperiences()).toEqual([]);

    // Nothing changed for the owner.
    expect((await alice.getJob(pending.id)).state).toBe('queued');
    expect((await alice.getExperience(experience.id)).bibleVersion).toBe(1);
    expect((await alice.assetForDownload(assetId)).objectKey).toMatch(/^o\//);
  });

  it('revokes approvals and cancels active jobs when the Story Bible changes', async () => {
    const store = await user();
    const experience = await store.createExperience(input);
    await approveAll(store, experience.id);
    const { job } = await store.requestGeneration(
      experience.id,
      experience.scenes[1].id,
      randomUUID(),
    );
    const approved = await store.getExperience(experience.id);
    expect(approved.scenes.every((scene) => scene.approvedAssetId)).toBe(true);

    await expect(
      store.editBible(experience.id, {
        expectedVersion: 2,
        outfit: 'Red dress',
        mood: 'Adventure',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'STALE_VERSION' });

    const edited = await store.editBible(experience.id, {
      expectedVersion: 1,
      outfit: 'Red dress',
      mood: 'Adventure',
    });
    expect(edited.bibleVersion).toBe(2);
    expect(edited.bible).toMatchObject({ version: 2, parentVersion: 1 });
    expect(edited.bible.facts).toMatchObject({ destination: 'Tokyo', outfit: 'Red dress' });
    expect(edited.scenes.every((scene) => scene.approvedAssetId === null)).toBe(true);
    expect(edited.scenes.every((scene) => scene.bibleVersion === 2)).toBe(true);
    expect(await store.getJob(job.id)).toMatchObject({
      state: 'cancelled',
      errorCode: 'BIBLE_CHANGED',
    });
    expect(
      await prisma.outboxEvent.count({ where: { topic: 'job.cancelled', aggregateId: job.id } }),
    ).toBe(1);
    const revoked = await prisma.approvalEvent.findMany({
      where: { experienceId: experience.id, kind: 'revoked' },
    });
    expect(revoked).toHaveLength(4);
    expect(revoked.every((event) => event.reason === 'bible_changed' && event.supersedesId)).toBe(
      true,
    );
    // Both versions persist.
    expect(await prisma.storyBible.count({ where: { experienceId: experience.id } })).toBe(2);

    // Unchanged facts are a no-op.
    const same = await store.editBible(experience.id, {
      expectedVersion: 2,
      outfit: 'Red dress',
      mood: 'Adventure',
    });
    expect(same.bibleVersion).toBe(2);
  });

  it('lets exactly one of two concurrent Bible edits win', async () => {
    const store = await user();
    const experience = await store.createExperience(input);
    const results = await Promise.allSettled([
      store.editBible(experience.id, {
        expectedVersion: 1,
        outfit: 'Red dress',
        mood: 'Adventure',
      }),
      store.editBible(experience.id, {
        expectedVersion: 1,
        outfit: 'Blue suit',
        mood: 'Slow living',
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ status: 409, code: 'STALE_VERSION' });
    expect(await prisma.storyBible.count({ where: { experienceId: experience.id } })).toBe(2);
  });

  it('exports only when every scene is approved at the current version', async () => {
    const store = await user();
    const experience = await store.createExperience(input);
    await expect(store.createExport(experience.id, 1)).rejects.toMatchObject({
      status: 409,
      code: 'EXPORT_NOT_READY',
    });
    await approveAll(store, experience.id);
    const first = await store.createExport(experience.id, 1);
    expect(first.created).toBe(true);
    expect(first.export.manifest.scenes).toHaveLength(4);
    expect(first.job).toMatchObject({ kind: 'export_render', state: 'queued', bibleVersion: 1 });
    const again = await store.createExport(experience.id, 1);
    expect(again).toMatchObject({ created: false, export: { id: first.export.id } });
    expect(again.job.id).toBe(first.job.id);

    const oldAsset = (await store.getExperience(experience.id)).scenes[0].approvedAssetId!;
    await store.editBible(experience.id, {
      expectedVersion: 1,
      outfit: 'Red dress',
      mood: 'Adventure',
    });
    await expect(store.createExport(experience.id, 1)).rejects.toMatchObject({
      code: 'STALE_VERSION',
    });
    await expect(store.createExport(experience.id, 2)).rejects.toMatchObject({
      code: 'EXPORT_NOT_READY',
    });
    await expect(store.approveAsset(oldAsset, 2)).rejects.toMatchObject({
      status: 409,
      code: 'ASSET_NOT_APPROVABLE',
    });
  });

  it('keeps approval lineage append-only and supersedes the previous approval', async () => {
    const store = await user();
    const experience = await store.createExperience(input);
    const scene = experience.scenes[2];
    const first = await candidate(store, experience.id, scene.id);
    const second = await candidate(store, experience.id, scene.id);
    const a = await store.approveAsset(first, 1);
    expect(await store.approveAsset(first, 1)).toMatchObject({
      approvalId: a.approvalId,
      created: false,
    });
    const b = await store.approveAsset(second, 1);
    const event = await prisma.approvalEvent.findUniqueOrThrow({ where: { id: b.approvalId } });
    expect(event.supersedesId).toBe(a.approvalId);
    const view = await store.getExperience(experience.id);
    expect(view.scenes.find((s) => s.id === scene.id)?.approvedAssetId).toBe(second);
  });

  it('rejects UPDATE, DELETE and TRUNCATE on append-only tables unless purging', async () => {
    const store = await user();
    const experience = await store.createExperience(input);
    const scene = experience.scenes[0];
    await store.approveAsset(await candidate(store, experience.id, scene.id), 1);
    const id = experience.id;
    await expect(
      prisma.$executeRaw`UPDATE story_bibles SET facts = '{}' WHERE experience_id = ${id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`DELETE FROM story_bibles WHERE experience_id = ${id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`UPDATE approval_events SET reason = 'superseded' WHERE experience_id = ${id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`DELETE FROM approval_events WHERE experience_id = ${id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`UPDATE audit_events SET action = 'x' WHERE target_id = ${id}`,
    ).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe('TRUNCATE audit_events')).rejects.toThrow(/append-only/);
    // Deleting the experience cascades into story_bibles and approval_events: blocked too.
    await expect(prisma.experience.delete({ where: { id } })).rejects.toThrow();
    expect(await prisma.storyBible.count({ where: { experienceId: id } })).toBe(1);

    await withPurge(prisma, (tx) => tx.experience.delete({ where: { id } }));
    expect(await prisma.storyBible.count({ where: { experienceId: id } })).toBe(0);
    expect(await prisma.approvalEvent.count({ where: { experienceId: id } })).toBe(0);
    // The flag ended with that transaction.
    await expect(
      prisma.$executeRaw`UPDATE audit_events SET action = 'x' WHERE user_id = ${store.userId}`,
    ).rejects.toThrow(/append-only/);
    // Hard-deleting a user sets audit_events.user_id to NULL, an UPDATE: purge only.
    await expect(prisma.user.delete({ where: { id: store.userId } })).rejects.toThrow();
    await withPurge(prisma, (tx) => tx.user.delete({ where: { id: store.userId } }));
    expect(await prisma.auditEvent.count({ where: { userId: store.userId } })).toBe(0);
  });

  it('refuses jobs that point at another account’s experience or upload', async () => {
    const alice = await user();
    const bob = await user();
    const experience = await alice.createExperience(input);
    const upload = await alice.initUpload({
      contentType: 'image/png',
      byteSize: 10,
      objectKey: key(),
    });
    const base = { kind: 'scene_generation' as const, provider: 'fake', userId: bob.userId };
    await expect(
      prisma.job.create({ data: { ...base, experienceId: experience.id, inputHash: 'x1' } }),
    ).rejects.toMatchObject({ code: 'P2003' }); // jobs_owner_guard raises 23503
    await expect(
      prisma.job.create({ data: { ...base, uploadId: upload.id, inputHash: 'x2' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.$executeRaw`UPDATE experiences SET user_id = ${bob.userId} WHERE id = ${experience.id}::uuid`,
    ).rejects.toThrow(/immutable/);
  });

  it('returns the same job for a repeated generation request', async () => {
    const store = await user();
    const experience = await store.createExperience(input);
    const scene = experience.scenes[0];
    const requestKey = randomUUID();
    const [a, b] = await Promise.all([
      store.requestGeneration(experience.id, scene.id, requestKey),
      store.requestGeneration(experience.id, scene.id, requestKey),
    ]);
    expect(a.job.id).toBe(b.job.id);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    const c = await store.requestGeneration(experience.id, scene.id, requestKey);
    expect(c).toMatchObject({ created: false, job: { id: a.job.id } });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: a.job.id } })).toBe(1);
  });

  it('leaves no job behind when the outbox write fails', async () => {
    const store = await user();
    const experience = await store.createExperience(input);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION wishscene_test_fail() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'outbox unavailable'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER outbox_fail BEFORE INSERT ON outbox_events
      FOR EACH ROW EXECUTE FUNCTION wishscene_test_fail()`);
    try {
      await expect(
        store.requestGeneration(experience.id, experience.scenes[0].id, randomUUID()),
      ).rejects.toThrow(/outbox unavailable/);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER outbox_fail ON outbox_events');
      await prisma.$executeRawUnsafe('DROP FUNCTION wishscene_test_fail()');
    }
    expect(await prisma.job.count({ where: { experienceId: experience.id } })).toBe(0);
  });

  it('rejects candidates from cancelled or stale jobs', async () => {
    const store = await user();
    const experience = await store.createExperience(input);
    const { job } = await store.requestGeneration(
      experience.id,
      experience.scenes[0].id,
      randomUUID(),
    );
    await store.editBible(experience.id, {
      expectedVersion: 1,
      outfit: 'Red dress',
      mood: 'Adventure',
    });
    const publish = () =>
      publishCandidate(prisma, { jobId: job.id, objectKey: key(), contentType: 'image/png' });
    await expect(publish()).rejects.toMatchObject({ code: 'JOB_NOT_ACTIVE' });
    // Even if a worker wrongly revived the job, its result is for Bible v1.
    await prisma.job.update({ where: { id: job.id }, data: { state: 'running' } });
    await expect(publish()).rejects.toMatchObject({ code: 'STALE_RESULT' });
    expect(await prisma.asset.count({ where: { jobId: job.id } })).toBe(0);
  });

  it('cancels only active jobs, once', async () => {
    const store = await user();
    const experience = await store.createExperience(input);
    const { job } = await store.requestGeneration(
      experience.id,
      experience.scenes[0].id,
      randomUUID(),
    );
    expect(await store.cancelJob(job.id)).toMatchObject({
      state: 'cancelled',
      errorCode: 'USER_CANCELLED',
    });
    expect((await store.cancelJob(job.id)).state).toBe('cancelled');
    expect(
      await prisma.outboxEvent.count({ where: { topic: 'job.cancelled', aggregateId: job.id } }),
    ).toBe(1);
  });

  it('completes uploads only when the stored object matches the declaration', async () => {
    const store = await user();
    await expect(
      store.initUpload({ contentType: 'image/png', byteSize: 10, objectKey: 'users/me/photo.png' }),
    ).rejects.toThrow();
    const upload = await store.initUpload({
      contentType: 'image/png',
      byteSize: 5000,
      objectKey: key(),
    });
    expect(upload.status).toBe('pending');
    await expect(store.completeUpload(upload.id, null)).rejects.toMatchObject({
      status: 409,
      code: 'UPLOAD_MISSING',
    });
    // No ETag, no pinned version: refuse and keep the upload pending for a retry.
    await expect(
      store.completeUpload(upload.id, { byteSize: 4000, contentType: 'image/png', etag: null }),
    ).rejects.toMatchObject({ status: 502, code: 'UPLOAD_UNVERIFIED' });
    expect((await prisma.upload.findUniqueOrThrow({ where: { id: upload.id } })).status).toBe(
      'pending',
    );
    const done = await store.completeUpload(upload.id, {
      byteSize: 4000,
      contentType: 'image/png',
      etag: '"v1"',
    });
    expect(done.upload).toMatchObject({ status: 'uploaded', byteSize: 4000 });
    expect(done.job).toMatchObject({
      kind: 'upload_validation',
      uploadId: upload.id,
      state: 'queued',
    });
    // The checked object version is pinned for the validator.
    expect((await prisma.upload.findUniqueOrThrow({ where: { id: upload.id } })).etag).toBe('"v1"');
    const events = await prisma.outboxEvent.findMany({ where: { aggregateId: done.job.id } });
    expect(events.map((event) => event.payload)).toEqual([{ jobId: done.job.id, etag: '"v1"' }]);
    await expect(
      store.completeUpload(upload.id, { byteSize: 4000, contentType: 'image/png', etag: '"v2"' }),
    ).rejects.toMatchObject({ code: 'UPLOAD_NOT_PENDING' });

    const big = await store.initUpload({
      contentType: 'image/jpeg',
      byteSize: 100,
      objectKey: key(),
    });
    await expect(
      store.completeUpload(big.id, { byteSize: 101, contentType: 'image/jpeg', etag: '"b"' }),
    ).rejects.toMatchObject({ status: 422, code: 'UPLOAD_REJECTED' });
    const wrong = await store.initUpload({
      contentType: 'image/jpeg',
      byteSize: 100,
      objectKey: key(),
    });
    await expect(
      store.completeUpload(wrong.id, { byteSize: 50, contentType: 'text/html', etag: '"w"' }),
    ).rejects.toMatchObject({ status: 422, code: 'UPLOAD_REJECTED' });
    expect(
      await prisma.upload.count({ where: { id: { in: [big.id, wrong.id] }, status: 'rejected' } }),
    ).toBe(2);
    expect(await prisma.job.count({ where: { uploadId: { in: [big.id, wrong.id] } } })).toBe(0);
  });

  it('never reports closing an upload that a concurrent request settled', async () => {
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, name: 'Test', email: `${userId}@x.test` } });
    const setup = ownerStore(prisma, userId);
    const expired = await setup.initUpload({
      contentType: 'image/png',
      byteSize: 100,
      objectKey: key(),
    });
    const mismatched = await setup.initUpload({
      contentType: 'image/png',
      byteSize: 100,
      objectKey: key(),
    });
    // Another request completes the upload right after this one read it as pending.
    const racing = prisma.$extends({
      query: {
        upload: {
          async findFirst({ args, query }) {
            const row = await query(args);
            if (row)
              await prisma.upload.update({ where: { id: row.id }, data: { status: 'uploaded' } });
            return row;
          },
        },
      },
    }) as unknown as PrismaClient;
    const later = ownerStore(racing, userId, () => new Date(Date.now() + 60 * 60_000));
    await expect(
      later.completeUpload(expired.id, { byteSize: 100, contentType: 'image/png', etag: '"e"' }),
    ).rejects.toMatchObject({ status: 409, code: 'UPLOAD_NOT_PENDING' });
    await expect(
      ownerStore(racing, userId).completeUpload(mismatched.id, {
        byteSize: 101,
        contentType: 'image/png',
        etag: '"m"',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'UPLOAD_NOT_PENDING' });
    expect(
      await prisma.upload.count({
        where: { id: { in: [expired.id, mismatched.id] }, status: 'uploaded' },
      }),
    ).toBe(2);
  });

  it('limits upload starts per account per hour', async () => {
    const store = await user();
    for (let i = 0; i < 30; i++)
      await store.initUpload({ contentType: 'image/png', byteSize: 10, objectKey: key() });
    await expect(
      store.initUpload({ contentType: 'image/png', byteSize: 10, objectKey: key() }),
    ).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    // Another account is unaffected.
    const other = await user();
    await expect(
      other.initUpload({ contentType: 'image/png', byteSize: 10, objectKey: key() }),
    ).resolves.toMatchObject({ status: 'pending' });
  });

  it('counts throttled attempts per key within a window', async () => {
    const key = `test:${randomUUID()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push((await takeThrottle(prisma, key, 3, 60_000)).allowed);
    expect(results).toEqual([true, true, true, false]);
    // The caller learns when the current window ends.
    const { retryAfterSeconds } = await takeThrottle(prisma, key, 3, 60_000);
    expect(retryAfterSeconds).toBeGreaterThan(50);
    expect(retryAfterSeconds).toBeLessThanOrEqual(60);
    expect((await takeThrottle(prisma, `test:${randomUUID()}`, 3, 60_000)).allowed).toBe(true);
    // Once the window has passed, the count starts over.
    await prisma.$executeRaw`UPDATE throttles SET window_start = now() - interval '2 minutes'
      WHERE key = ${key}`;
    expect((await takeThrottle(prisma, key, 3, 60_000)).allowed).toBe(true);
    expect((await prisma.throttle.findUniqueOrThrow({ where: { key } })).count).toBe(1);
    await expect(takeThrottle(prisma, key, 3, THROTTLE_MAX_WINDOW_MS + 1)).rejects.toThrow();
  });

  it('prunes throttle rows older than the longest window', async () => {
    const stale = `test:${randomUUID()}`;
    const fresh = `test:${randomUUID()}`;
    await takeThrottle(prisma, stale, 3, 60_000);
    await takeThrottle(prisma, fresh, 3, 60_000);
    await prisma.$executeRaw`UPDATE throttles SET window_start = now() - interval '25 hours'
      WHERE key = ${stale}`;
    await pruneThrottles(prisma);
    const left = await prisma.throttle.findMany({ where: { key: { in: [stale, fresh] } } });
    expect(left.map((row) => row.key)).toEqual([fresh]);
  });

  it('matches the Prisma schema after migrating a fresh database', () => {
    const diff = runPrisma(
      [
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      db.url,
    );
    expect(diff.status, diff.output).toBe(0);
  });
});
