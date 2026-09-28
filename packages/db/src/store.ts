import { createHash } from 'node:crypto';
import type { Destination, ExperienceInput, StoryUpdate } from '@wishscene/contracts';
import { DomainError, planScenes, type ScenePlan } from '@wishscene/domain';
import { isUniqueViolation, TX, type PrismaClient, type Tx } from './client';
import type { ApprovalKind, Asset, Export, Job, JobState, Upload } from './generated/prisma/client';

// Every method is scoped to one signed-in user. Rows owned by someone else and malformed ids
// both return 404 NOT_FOUND so existence never leaks (ADR 0002).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_KEY = /^o\/[A-Za-z0-9_-]{43}$/;
const ACTIVE: JobState[] = ['queued', 'running'];
export const EXPERIENCE_LIMIT = 50;
export const ACTIVE_JOB_LIMIT = 20;
export const UPLOADS_PER_HOUR = 30;
// The presigned POST itself lives 5 minutes; completion may arrive a little later.
const UPLOAD_COMPLETE_MS = 15 * 60_000;
const EXPORT_TTL_MS = 7 * 24 * 60 * 60_000;
const PROVIDER = 'fake';

export interface BibleFacts {
  destination: Destination;
  outfit: string;
  mood: ExperienceInput['mood'];
}
export interface ExperienceSummary {
  id: string;
  title: string;
  bibleVersion: number;
  createdAt: string;
}
export interface SceneView extends ScenePlan {
  id: string;
  ordinal: number;
  bibleVersion: number;
  approvedAssetId: string | null;
}
export interface AssetView {
  id: string;
  sceneId: string | null;
  type: Asset['type'];
  status: Asset['status'];
  bibleVersion: number;
  createdAt: string;
}
export interface ExperienceView extends ExperienceSummary {
  bible: { version: number; parentVersion: number | null; facts: BibleFacts };
  scenes: SceneView[];
  assets: AssetView[];
}
export interface JobView {
  id: string;
  kind: Job['kind'];
  state: JobState;
  experienceId: string | null;
  sceneId: string | null;
  uploadId: string | null;
  bibleVersion: number | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface UploadView {
  id: string;
  status: Upload['status'];
  contentType: string;
  maxBytes: number;
  byteSize: number | null;
  expiresAt: string;
}
export interface ExportManifest {
  scenes: Array<{ sceneId: string; assetId: string; approvalId: string }>;
}
export interface ExportView {
  id: string;
  experienceId: string;
  bibleVersion: number;
  manifest: ExportManifest;
  createdAt: string;
  expiresAt: string;
}
export interface ObjectHead {
  byteSize: number;
  contentType: string | null;
  etag?: string | null;
}

export const notFound = () => new DomainError(404, 'NOT_FOUND', 'Not found.');
const stale = () =>
  new DomainError(409, 'STALE_VERSION', 'The story changed. Refresh and try again.');
function assertId(id: string) {
  if (!UUID.test(id)) throw notFound();
}
export function inputHash(parts: unknown[]) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export const jobView = (job: Job): JobView => ({
  id: job.id,
  kind: job.kind,
  state: job.state,
  experienceId: job.experienceId,
  sceneId: job.sceneId,
  uploadId: job.uploadId,
  bibleVersion: job.bibleVersion,
  errorCode: job.errorCode,
  createdAt: job.createdAt.toISOString(),
  updatedAt: job.updatedAt.toISOString(),
});
const uploadView = (upload: Upload): UploadView => ({
  id: upload.id,
  status: upload.status,
  contentType: upload.contentType,
  maxBytes: upload.maxBytes,
  byteSize: upload.byteSize,
  expiresAt: upload.expiresAt.toISOString(),
});
const exportView = (row: Export): ExportView => ({
  id: row.id,
  experienceId: row.experienceId,
  bibleVersion: row.bibleVersion,
  manifest: row.manifest as unknown as ExportManifest,
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
});

type Locked = Array<{ current_bible_version: number }>;
/** Locks the owner's live experience row and returns its current Bible version, or 404s. */
export async function lockExperience(tx: Tx, userId: string, id: string, mode: 'update' | 'share') {
  const rows =
    mode === 'update'
      ? await tx.$queryRaw<Locked>`SELECT current_bible_version FROM experiences
          WHERE id = ${id}::uuid AND user_id = ${userId} AND deleted_at IS NULL FOR UPDATE`
      : await tx.$queryRaw<Locked>`SELECT current_bible_version FROM experiences
          WHERE id = ${id}::uuid AND user_id = ${userId} AND deleted_at IS NULL FOR SHARE`;
  if (!rows.length) throw notFound();
  return rows[0].current_bible_version;
}

// Serializes per-user quota checks. NO KEY UPDATE does not block inserts that reference the user.
async function lockUser(tx: Tx, userId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users
    WHERE id = ${userId} AND deleted_at IS NULL FOR NO KEY UPDATE`;
  if (!rows.length) throw new DomainError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
}

type Approval = {
  id: string;
  scene_id: string;
  asset_id: string;
  kind: ApprovalKind;
  bible_version: number;
};
/** Effective approval: a scene's latest event, when it is `approved` at the current version. */
export async function effectiveApprovals(db: Tx, experienceId: string, version: number) {
  const latest = await db.$queryRaw<Approval[]>`SELECT DISTINCT ON (scene_id)
      id, scene_id, asset_id, kind, bible_version
    FROM approval_events WHERE experience_id = ${experienceId}::uuid
    ORDER BY scene_id, seq DESC`;
  const effective = new Map<string, { id: string; assetId: string }>();
  for (const event of latest)
    if (event.kind === 'approved' && event.bible_version === version)
      effective.set(event.scene_id, { id: event.id, assetId: event.asset_id });
  return effective;
}

export function ownerStore(prisma: PrismaClient, userId: string, clock = () => new Date()) {
  const audit = (tx: Tx, action: string, targetId: string | null) =>
    tx.auditEvent.create({ data: { userId, action, targetId } });
  const outbox = (tx: Tx, topic: string, aggregateId: string, payload: Record<string, string>) =>
    tx.outboxEvent.create({ data: { topic, aggregateId, payload } });

  async function getExperience(id: string): Promise<ExperienceView> {
    assertId(id);
    return prisma.$transaction(
      async (tx) => {
        const experience = await tx.experience.findFirst({
          where: { id, userId, deletedAt: null },
          include: {
            scenes: { orderBy: { ordinal: 'asc' } },
            assets: { orderBy: { createdAt: 'asc' } },
          },
        });
        if (!experience) throw notFound();
        const version = experience.currentBibleVersion;
        const bible = await tx.storyBible.findUniqueOrThrow({
          where: { experienceId_version: { experienceId: id, version } },
        });
        const approvals = await effectiveApprovals(tx, id, version);
        return {
          id: experience.id,
          title: experience.title,
          bibleVersion: version,
          createdAt: experience.createdAt.toISOString(),
          bible: {
            version,
            parentVersion: bible.parentVersion,
            facts: bible.facts as unknown as BibleFacts,
          },
          scenes: experience.scenes.map((scene) => {
            const spec = scene.spec as unknown as ScenePlan;
            return {
              id: scene.id,
              ordinal: scene.ordinal,
              title: spec.title,
              shot: spec.shot,
              time: spec.time,
              art: spec.art,
              bibleVersion: scene.bibleVersion,
              approvedAssetId: approvals.get(scene.id)?.assetId ?? null,
            };
          }),
          assets: experience.assets.map((asset) => ({
            id: asset.id,
            sceneId: asset.sceneId,
            type: asset.type,
            status: asset.status,
            bibleVersion: asset.bibleVersion,
            createdAt: asset.createdAt.toISOString(),
          })),
        };
      },
      { ...TX, isolationLevel: 'RepeatableRead' },
    );
  }

  return {
    userId,
    getExperience,

    async listExperiences(): Promise<ExperienceSummary[]> {
      const rows = await prisma.experience.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, currentBibleVersion: true, createdAt: true },
      });
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        bibleVersion: row.currentBibleVersion,
        createdAt: row.createdAt.toISOString(),
      }));
    },

    async createExperience(input: ExperienceInput) {
      const id = await prisma.$transaction(async (tx) => {
        await lockUser(tx, userId);
        if ((await tx.experience.count({ where: { userId, deletedAt: null } })) >= EXPERIENCE_LIMIT)
          throw new DomainError(409, 'LIMIT', `An account holds ${EXPERIENCE_LIMIT} experiences.`);
        const facts: BibleFacts = {
          destination: input.destination,
          outfit: input.outfit,
          mood: input.mood,
        };
        const experience = await tx.experience.create({
          data: {
            userId,
            title: input.title,
            bibles: { create: { version: 1, facts: { ...facts } } },
            scenes: {
              create: planScenes(input.destination).map((spec, ordinal) => ({
                ordinal,
                spec: { ...spec },
                bibleVersion: 1,
              })),
            },
          },
          select: { id: true },
        });
        await audit(tx, 'experience.created', experience.id);
        return experience.id;
      }, TX);
      return getExperience(id);
    },

    // hunch-rule: A Story Bible edit must invalidate previous approvals and cancel active jobs before a newer version can be exported.
    async editBible(id: string, update: StoryUpdate) {
      assertId(id);
      await prisma.$transaction(async (tx) => {
        const version = await lockExperience(tx, userId, id, 'update');
        if (update.expectedVersion !== version) throw stale();
        const current = await tx.storyBible.findUniqueOrThrow({
          where: { experienceId_version: { experienceId: id, version } },
        });
        const facts = current.facts as unknown as BibleFacts;
        if (facts.outfit === update.outfit && facts.mood === update.mood) return;
        const next = version + 1;
        await tx.storyBible.create({
          data: {
            experienceId: id,
            version: next,
            parentVersion: version,
            facts: { ...facts, outfit: update.outfit, mood: update.mood },
          },
        });
        await tx.experience.update({ where: { id }, data: { currentBibleVersion: next } });
        await tx.scene.updateMany({ where: { experienceId: id }, data: { bibleVersion: next } });
        const approvals = await effectiveApprovals(tx, id, version);
        if (approvals.size)
          await tx.approvalEvent.createMany({
            data: [...approvals].map(([sceneId, approval]) => ({
              experienceId: id,
              sceneId,
              assetId: approval.assetId,
              kind: 'revoked' as const,
              reason: 'bible_changed' as const,
              bibleVersion: next,
              supersedesId: approval.id,
              actorUserId: userId,
            })),
          });
        const cancelled = await tx.$queryRaw<Array<{ id: string }>>`UPDATE jobs
          SET state = 'cancelled', error_code = 'BIBLE_CHANGED', updated_at = now()
          WHERE experience_id = ${id}::uuid AND state IN ('queued', 'running')
          RETURNING id`;
        if (cancelled.length)
          await tx.outboxEvent.createMany({
            data: cancelled.map((job) => ({
              topic: 'job.cancelled',
              aggregateId: job.id,
              payload: { jobId: job.id },
            })),
          });
        await audit(tx, 'bible.edited', id);
      }, TX);
      return getExperience(id);
    },

    async requestGeneration(experienceId: string, sceneId: string, requestKey: string) {
      assertId(experienceId);
      assertId(sceneId);
      let hash: string | undefined;
      try {
        return await prisma.$transaction(async (tx) => {
          await lockUser(tx, userId);
          const version = await lockExperience(tx, userId, experienceId, 'share');
          const scene = await tx.scene.findFirst({
            where: { id: sceneId, experienceId },
            select: { id: true },
          });
          if (!scene) throw notFound();
          hash = inputHash(['scene_generation', experienceId, sceneId, version, requestKey]);
          const existing = await tx.job.findUnique({
            where: { userId_inputHash: { userId, inputHash: hash } },
          });
          if (existing) return { job: jobView(existing), created: false };
          if (
            (await tx.job.count({ where: { userId, state: { in: ACTIVE } } })) >= ACTIVE_JOB_LIMIT
          )
            throw new DomainError(429, 'TOO_MANY_JOBS', 'Wait for running generations to finish.');
          const job = await tx.job.create({
            data: {
              userId,
              experienceId,
              sceneId,
              kind: 'scene_generation',
              inputHash: hash,
              bibleVersion: version,
              provider: PROVIDER,
            },
          });
          await outbox(tx, 'job.created', job.id, { jobId: job.id });
          await audit(tx, 'generation.requested', job.id);
          return { job: jobView(job), created: true };
        }, TX);
      } catch (error) {
        if (!hash || !isUniqueViolation(error)) throw error;
        const job = await prisma.job.findUnique({
          where: { userId_inputHash: { userId, inputHash: hash } },
        });
        if (!job) throw error;
        return { job: jobView(job), created: false };
      }
    },

    async getJob(id: string) {
      assertId(id);
      const job = await prisma.job.findFirst({ where: { id, userId } });
      if (!job) throw notFound();
      return jobView(job);
    },

    async cancelJob(id: string) {
      assertId(id);
      return prisma.$transaction(async (tx) => {
        const cancelled = await tx.$queryRaw<Array<{ id: string }>>`UPDATE jobs
          SET state = 'cancelled', error_code = 'USER_CANCELLED', updated_at = now()
          WHERE id = ${id}::uuid AND user_id = ${userId} AND state IN ('queued', 'running')
          RETURNING id`;
        if (cancelled.length) {
          await outbox(tx, 'job.cancelled', id, { jobId: id });
          await audit(tx, 'job.cancelled', id);
        }
        const job = await tx.job.findFirst({ where: { id, userId } });
        if (!job) throw notFound();
        return jobView(job);
      }, TX);
    },

    async approveAsset(assetId: string, expectedVersion: number) {
      assertId(assetId);
      const owned = await prisma.asset.findFirst({
        where: { id: assetId, experience: { userId, deletedAt: null } },
        select: { experienceId: true },
      });
      if (!owned) throw notFound();
      const experienceId = owned.experienceId;
      return prisma.$transaction(async (tx) => {
        const version = await lockExperience(tx, userId, experienceId, 'update');
        if (expectedVersion !== version) throw stale();
        const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId } });
        const sceneId = asset.sceneId;
        if (
          !sceneId ||
          asset.type !== 'candidate' ||
          asset.status !== 'ready' ||
          asset.bibleVersion !== version
        )
          throw new DomainError(
            409,
            'ASSET_NOT_APPROVABLE',
            'Only a ready image made for the current story can be approved.',
          );
        const latest = await tx.approvalEvent.findFirst({
          where: { sceneId },
          orderBy: { seq: 'desc' },
        });
        const effective =
          latest?.kind === 'approved' && latest.bibleVersion === version ? latest : null;
        if (effective?.assetId === assetId)
          return { approvalId: effective.id, experienceId, sceneId, created: false };
        const event = await tx.approvalEvent.create({
          data: {
            experienceId,
            sceneId,
            assetId,
            kind: 'approved',
            reason: 'user',
            bibleVersion: version,
            supersedesId: effective?.id ?? null,
            actorUserId: userId,
          },
        });
        await audit(tx, 'asset.approved', assetId);
        return { approvalId: event.id, experienceId, sceneId, created: true };
      }, TX);
    },

    async createExport(experienceId: string, expectedVersion: number) {
      assertId(experienceId);
      return prisma.$transaction(async (tx) => {
        const version = await lockExperience(tx, userId, experienceId, 'update');
        if (expectedVersion !== version) throw stale();
        const scenes = await tx.scene.findMany({
          where: { experienceId },
          orderBy: { ordinal: 'asc' },
          select: { id: true },
        });
        const approvals = await effectiveApprovals(tx, experienceId, version);
        const assets = new Map(
          (
            await tx.asset.findMany({
              where: { id: { in: [...approvals.values()].map((a) => a.assetId) } },
              select: { id: true, bibleVersion: true, status: true },
            })
          ).map((asset) => [asset.id, asset]),
        );
        const notReady = new DomainError(
          409,
          'EXPORT_NOT_READY',
          'Approve an image for every scene of the current story first.',
        );
        if (!scenes.length) throw notReady;
        const manifest: ExportManifest = {
          scenes: scenes.map((scene) => {
            const approval = approvals.get(scene.id);
            const asset = approval && assets.get(approval.assetId);
            if (!approval || !asset || asset.bibleVersion !== version || asset.status !== 'ready')
              throw notReady;
            return { sceneId: scene.id, assetId: approval.assetId, approvalId: approval.id };
          }),
        };
        const signature = manifest.scenes.map((scene) => scene.approvalId).join();
        const previous = (
          await tx.export.findMany({
            where: { experienceId, bibleVersion: version, expiresAt: { gt: clock() } },
            orderBy: { createdAt: 'desc' },
          })
        ).find(
          (row) =>
            (row.manifest as unknown as ExportManifest).scenes
              .map((scene) => scene.approvalId)
              .join() === signature,
        );
        if (previous) {
          const job = await tx.job.findUnique({
            where: {
              userId_inputHash: { userId, inputHash: inputHash(['export_render', previous.id]) },
            },
          });
          if (job) return { export: exportView(previous), job: jobView(job), created: false };
        }
        const row = await tx.export.create({
          data: {
            experienceId,
            bibleVersion: version,
            manifest: { scenes: manifest.scenes.map((scene) => ({ ...scene })) },
            expiresAt: new Date(clock().getTime() + EXPORT_TTL_MS),
          },
        });
        const job = await tx.job.create({
          data: {
            userId,
            experienceId,
            kind: 'export_render',
            inputHash: inputHash(['export_render', row.id]),
            bibleVersion: version,
            provider: PROVIDER,
          },
        });
        await outbox(tx, 'job.created', job.id, { jobId: job.id, exportId: row.id });
        await audit(tx, 'export.requested', row.id);
        return { export: exportView(row), job: jobView(job), created: true };
      }, TX);
    },

    /** `objectKey` must come from @wishscene/storage objectKey(); the caller presigns it. */
    async initUpload(input: { contentType: string; byteSize: number; objectKey: string }) {
      if (!OBJECT_KEY.test(input.objectKey))
        throw new Error('Upload keys must come from @wishscene/storage objectKey().');
      if (!Number.isInteger(input.byteSize) || input.byteSize < 1)
        throw new DomainError(400, 'VALIDATION', 'byteSize must be a positive integer.');
      return prisma.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const since = new Date(clock().getTime() - 60 * 60_000);
        if (
          (await tx.upload.count({ where: { userId, createdAt: { gt: since } } })) >=
          UPLOADS_PER_HOUR
        )
          throw new DomainError(429, 'RATE_LIMITED', 'Too many uploads. Try again later.');
        const upload = await tx.upload.create({
          data: {
            userId,
            objectKey: input.objectKey,
            contentType: input.contentType,
            maxBytes: input.byteSize,
            expiresAt: new Date(clock().getTime() + UPLOAD_COMPLETE_MS),
          },
        });
        await audit(tx, 'upload.initiated', upload.id);
        return uploadView(upload);
      }, TX);
    },

    /** The object key of the owner's upload, so the caller can inspect the stored object. */
    async uploadObjectKey(id: string) {
      assertId(id);
      const upload = await prisma.upload.findFirst({
        where: { id, userId },
        select: { objectKey: true },
      });
      if (!upload) throw notFound();
      return upload.objectKey;
    },

    /**
     * Marks an upload uploaded and creates its validation job in one transaction. Throws
     * UPLOAD_REJECTED (422) or UPLOAD_EXPIRED (410) after closing the row; the caller then
     * deletes the stored object.
     */
    async completeUpload(id: string, head: ObjectHead | null) {
      assertId(id);
      const upload = await prisma.upload.findFirst({ where: { id, userId } });
      if (!upload) throw notFound();
      const notPending = new DomainError(
        409,
        'UPLOAD_NOT_PENDING',
        'This upload was already completed or closed.',
      );
      if (upload.status !== 'pending') throw notPending;
      const now = clock();
      const close = async (status: 'expired' | 'rejected', action: string) => {
        await prisma.$transaction(async (tx) => {
          const closed = await tx.upload.updateMany({
            where: { id, userId, status: 'pending' },
            data: { status, byteSize: head?.byteSize ?? null, completedAt: now },
          });
          if (closed.count) await audit(tx, action, id);
        }, TX);
      };
      if (upload.expiresAt <= now) {
        await close('expired', 'upload.expired');
        throw new DomainError(410, 'UPLOAD_EXPIRED', 'This upload expired. Start a new one.');
      }
      if (!head) throw new DomainError(409, 'UPLOAD_MISSING', 'No file was received yet.');
      if (
        head.byteSize < 1 ||
        head.byteSize > upload.maxBytes ||
        head.contentType !== upload.contentType
      ) {
        await close('rejected', 'upload.rejected');
        throw new DomainError(
          422,
          'UPLOAD_REJECTED',
          'The file does not match the declared type or size.',
        );
      }
      return prisma.$transaction(async (tx) => {
        const updated = await tx.upload.updateMany({
          where: { id, userId, status: 'pending' },
          data: {
            status: 'uploaded',
            byteSize: head.byteSize,
            etag: head.etag ?? null,
            completedAt: now,
          },
        });
        if (!updated.count) throw notPending;
        const job = await tx.job.create({
          data: {
            userId,
            uploadId: id,
            kind: 'upload_validation',
            inputHash: inputHash(['upload_validation', id]),
            provider: 'internal',
          },
        });
        // The validator reads the object with If-Match: etag, so a later replacement fails.
        await outbox(tx, 'job.created', job.id, {
          jobId: job.id,
          ...(head.etag ? { etag: head.etag } : {}),
        });
        await audit(tx, 'upload.completed', id);
        const saved = await tx.upload.findUniqueOrThrow({ where: { id } });
        return { upload: uploadView(saved), job: jobView(job) };
      }, TX);
    },

    /** Owner check before a download URL is signed. Never returns or records the URL. */
    async assetForDownload(id: string) {
      assertId(id);
      const asset = await prisma.asset.findFirst({
        where: {
          id,
          status: 'ready',
          objectKey: { not: null },
          experience: { userId, deletedAt: null },
        },
        select: { objectKey: true, contentType: true },
      });
      if (!asset?.objectKey) throw notFound();
      await prisma.auditEvent.create({
        data: { userId, action: 'asset.downloaded', targetId: id },
      });
      return { objectKey: asset.objectKey, contentType: asset.contentType };
    },
  };
}
export type OwnerStore = ReturnType<typeof ownerStore>;
