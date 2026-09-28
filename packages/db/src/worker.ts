import { DomainError } from '@wishscene/domain';
import { TX, type PrismaClient } from './client';
import { jobView } from './store';

// System scope for workers (issue #3). Not reachable from the HTTP API.

/**
 * Records a generated image for a scene-generation job. Rejects results for jobs that are no
 * longer active or were made for an older Story Bible version, so a stale image can never
 * become an approvable asset.
 */
export async function publishCandidate(
  prisma: PrismaClient,
  input: { jobId: string; objectKey: string; contentType: string },
) {
  const found = await prisma.job.findUnique({
    where: { id: input.jobId },
    select: { experienceId: true },
  });
  if (!found?.experienceId) throw new DomainError(404, 'NOT_FOUND', 'Job not found.');
  const experienceId = found.experienceId;
  return prisma.$transaction(async (tx) => {
    // Same lock order as Bible edits: experience first, then the job.
    const [experience] = await tx.$queryRaw<Array<{ current_bible_version: number }>>`
      SELECT current_bible_version FROM experiences WHERE id = ${experienceId}::uuid FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM jobs WHERE id = ${input.jobId}::uuid FOR UPDATE`;
    const job = await tx.job.findUniqueOrThrow({ where: { id: input.jobId } });
    if (job.kind !== 'scene_generation' || !job.sceneId || job.bibleVersion === null)
      throw new DomainError(409, 'JOB_KIND', 'Only scene generations publish candidates.');
    if (job.state !== 'queued' && job.state !== 'running')
      throw new DomainError(409, 'JOB_NOT_ACTIVE', 'The job was cancelled or already finished.');
    if (!experience || job.bibleVersion !== experience.current_bible_version)
      throw new DomainError(409, 'STALE_RESULT', 'The Story Bible changed after this job started.');
    const asset = await tx.asset.create({
      data: {
        experienceId,
        sceneId: job.sceneId,
        jobId: job.id,
        type: 'candidate',
        status: 'ready',
        objectKey: input.objectKey,
        contentType: input.contentType,
        bibleVersion: job.bibleVersion,
      },
    });
    const done = await tx.job.update({ where: { id: job.id }, data: { state: 'ready' } });
    await tx.outboxEvent.create({
      data: {
        topic: 'job.ready',
        aggregateId: job.id,
        payload: { jobId: job.id, assetId: asset.id },
      },
    });
    return { assetId: asset.id, job: jobView(done) };
  }, TX);
}
