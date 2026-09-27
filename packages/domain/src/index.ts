import { randomUUID } from 'node:crypto';
import type {
  Experience,
  ExperienceInput,
  ExportManifest,
  GenerationInput,
  Job,
  Scene,
  StoryUpdate,
  Workspace,
} from '@wishscene/contracts';
import { MockImageProvider, type ImageProvider } from '@wishscene/providers';

export class DomainError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const shotLists = {
  Tokyo: [
    ['Neon kind of night', 'Wide · street portrait', '19:30', 'tokyo'],
    ['A table for daydreams', 'Medium · café moment', '20:15', 'cafe'],
    ['Above the ordinary', 'Wide · rooftop skyline', '21:00', 'rooftop'],
    ['The long way home', 'Close · city walk', '22:10', 'street'],
  ],
  Kyoto: [
    ['A softer kind of morning', 'Wide · garden walk', '07:30', 'garden'],
    ['Matcha, unhurried', 'Medium · café moment', '09:00', 'cafe'],
    ['Follow the lanterns', 'Wide · old town', '17:15', 'street'],
    ['Last light, first wish', 'Wide · hilltop view', '18:00', 'garden'],
  ],
  Amalfi: [
    ['Somewhere in the sunshine', 'Wide · coastal view', '17:30', 'coast'],
    ['Espresso with a view', 'Medium · terrace moment', '17:45', 'cafe'],
    ['Take the scenic route', 'Wide · seaside walk', '18:00', 'coast'],
    ['Golden hour, forever', 'Wide · sunset portrait', '18:10', 'rooftop'],
  ],
  Iceland: [
    ['Into the quiet', 'Wide · mountain portrait', '08:00', 'mountain'],
    ['A very small human', 'Wide · dramatic landscape', '10:30', 'mountain'],
    ['One warm cup', 'Medium · cabin moment', '14:15', 'cafe'],
    ['Under another sky', 'Wide · northern lights', '22:00', 'aurora'],
  ],
} as const;
const active = (job: Job) => job.status === 'queued' || job.status === 'running';

// hunch-why: Keep mock state behind the domain boundary intended for persistence. Each browser gets its own workspace, with no identity uploads or provider calls.
export class MockStudio {
  private state: Workspace;
  constructor(
    private clock = () => Date.now(),
    private id: () => string = () => randomUUID(),
    private provider: ImageProvider = new MockImageProvider(),
  ) {
    this.state = this.seed();
  }
  private makeExperience(input: ExperienceInput, id = this.id()): Experience {
    return {
      ...input,
      id,
      bibleVersion: 1,
      createdAt: new Date(this.clock()).toISOString(),
      caption: `A little daydream from ${input.destination}. ✨\nCreated with wishscene. #AIcreated #wishscene`,
      scenes: shotLists[input.destination].map(([title, shot, time, art], ordinal) => ({
        id: `${id}-scene-${ordinal + 1}`,
        title,
        shot,
        time,
        art,
        ordinal,
        status: 'draft',
        assets: [],
        approvedAssetId: null,
      })),
    };
  }
  private seed(): Workspace {
    const tokyo = this.makeExperience(
      {
        title: 'Tokyo, after hours',
        destination: 'Tokyo',
        outfit: 'Ivory jacket · charcoal trousers',
        mood: 'After hours',
      },
      'tokyo-after-hours',
    );
    tokyo.scenes.slice(0, 3).forEach((scene, i) => {
      scene.assets = this.provider.candidates({
        jobId: `seed-${i}`,
        scene,
        story: tokyo,
        bibleVersion: 1,
        createdAt: tokyo.createdAt,
      });
      scene.status = i < 2 ? 'approved' : 'review';
      scene.approvedAssetId = i < 2 ? scene.assets[0].id : null;
    });
    return {
      mode: 'mock',
      profile: {
        name: 'Alex Morgan',
        referenceCount: 0,
        description:
          'Fictional AI-created man shared across 16 bundled travel photos. No personal photos uploaded.',
      },
      experiences: [
        tokyo,
        this.makeExperience(
          {
            title: 'Postcards from Amalfi',
            destination: 'Amalfi',
            outfit: 'Linen shirt · relaxed neutrals',
            mood: 'Golden hour',
          },
          'amalfi-postcards',
        ),
        this.makeExperience(
          {
            title: 'Find me in the quiet',
            destination: 'Iceland',
            outfit: 'Amber parka · hiking boots',
            mood: 'Adventure',
          },
          'iceland-quiet',
        ),
      ],
      jobs: [],
    };
  }
  reset() {
    this.state = this.seed();
    return this.snapshot();
  }
  snapshot(): Workspace {
    this.settle();
    return structuredClone(this.state);
  }
  private experience(id: string) {
    const item = this.state.experiences.find((x) => x.id === id);
    if (!item) throw new DomainError(404, 'NOT_FOUND', 'Experience not found.');
    return item;
  }
  private scene(experienceId: string, sceneId: string) {
    const experience = this.experience(experienceId);
    const scene = experience.scenes.find((x) => x.id === sceneId);
    if (!scene) throw new DomainError(404, 'NOT_FOUND', 'Scene not found.');
    return { experience, scene };
  }
  create(input: ExperienceInput) {
    if (this.state.experiences.length >= 20)
      throw new DomainError(
        409,
        'LIMIT',
        'The demo holds 20 experiences. Reset the workspace to start fresh.',
      );
    const experience = this.makeExperience(input);
    this.state.experiences.unshift(experience);
    return structuredClone(experience);
  }
  // hunch-rule: A Story Bible edit must invalidate previous approvals and cancel active jobs before a newer version can be exported.
  updateStory(id: string, input: StoryUpdate) {
    this.settle();
    const experience = this.experience(id);
    if (input.expectedVersion !== experience.bibleVersion)
      throw new DomainError(409, 'STALE_VERSION', 'The story changed. Refresh and try again.');
    if (input.outfit === experience.outfit && input.mood === experience.mood)
      return structuredClone(experience);
    experience.bibleVersion += 1;
    experience.outfit = input.outfit;
    experience.mood = input.mood;
    experience.scenes.forEach((scene) => {
      scene.approvedAssetId = null;
      scene.status = scene.assets.length ? 'stale' : 'draft';
    });
    this.state.jobs
      .filter((job) => job.experienceId === id && active(job))
      .forEach((job) => {
        job.status = 'cancelled';
      });
    return structuredClone(experience);
  }
  caption(id: string, caption: string) {
    this.experience(id).caption = caption;
  }
  generate(experienceId: string, sceneId: string, input: GenerationInput): Job {
    this.settle();
    const { experience, scene } = this.scene(experienceId, sceneId);
    const prior = this.state.jobs.find((job) => job.requestKey === input.requestKey);
    if (prior) {
      if (
        prior.sceneId !== sceneId ||
        prior.experienceId !== experienceId ||
        prior.bibleVersion !== experience.bibleVersion ||
        prior.scenario !== input.scenario
      )
        throw new DomainError(
          409,
          'KEY_REUSED',
          'Use a new request key for a different generation.',
        );
      return structuredClone(prior);
    }
    if (this.state.jobs.some((job) => job.sceneId === sceneId && active(job)))
      throw new DomainError(409, 'ALREADY_RUNNING', 'This scene is already generating.');
    if (this.state.jobs.length >= 500)
      throw new DomainError(409, 'LIMIT', 'The demo job limit was reached. Reset the workspace.');
    const startedAt = this.clock();
    const job: Job = {
      id: this.id(),
      experienceId,
      sceneId,
      bibleVersion: experience.bibleVersion,
      status: 'queued',
      scenario: input.scenario,
      requestKey: input.requestKey,
      startedAt,
      finishesAt: startedAt + (input.scenario === 'slow' ? 12000 : 2400),
    };
    this.state.jobs.push(job);
    scene.status = 'generating';
    return structuredClone(job);
  }
  private restore(scene: Scene, version: number) {
    scene.status = scene.approvedAssetId
      ? 'approved'
      : scene.assets.some((asset) => asset.bibleVersion === version)
        ? 'review'
        : scene.assets.length
          ? 'stale'
          : 'draft';
  }
  cancel(id: string) {
    this.settle();
    const job = this.state.jobs.find((x) => x.id === id);
    if (!job) throw new DomainError(404, 'NOT_FOUND', 'Job not found.');
    if (active(job)) {
      job.status = 'cancelled';
      const { experience, scene } = this.scene(job.experienceId, job.sceneId);
      this.restore(scene, experience.bibleVersion);
    }
  }
  private settle() {
    const now = this.clock();
    this.state.jobs.filter(active).forEach((job) => {
      const { experience, scene } = this.scene(job.experienceId, job.sceneId);
      if (job.bibleVersion !== experience.bibleVersion) {
        job.status = 'cancelled';
        this.restore(scene, experience.bibleVersion);
        return;
      }
      if (now < job.finishesAt) {
        job.status = now - job.startedAt >= 350 ? 'running' : 'queued';
        return;
      }
      if (job.scenario === 'failure') {
        job.status = 'failed';
        job.error =
          'Simulated provider timeout. Your approved choice is preserved; retry when ready.';
        scene.status = 'failed';
        return;
      }
      job.status = 'ready';
      scene.assets.push(
        ...this.provider.candidates({
          jobId: job.id,
          scene,
          story: experience,
          bibleVersion: job.bibleVersion,
          createdAt: new Date(now).toISOString(),
        }),
      );
      scene.status = 'review';
    });
  }
  approve(experienceId: string, sceneId: string, assetId: string, expectedVersion: number) {
    this.settle();
    const { experience, scene } = this.scene(experienceId, sceneId);
    const asset = scene.assets.find((x) => x.id === assetId);
    if (!asset) throw new DomainError(404, 'NOT_FOUND', 'Candidate not found.');
    if (
      expectedVersion !== experience.bibleVersion ||
      asset.bibleVersion !== experience.bibleVersion
    )
      throw new DomainError(
        409,
        'STALE_VERSION',
        'This candidate belongs to an older story. Generate a new one.',
      );
    if (this.state.jobs.some((job) => job.sceneId === sceneId && active(job)))
      throw new DomainError(
        409,
        'ALREADY_RUNNING',
        'Wait for generation or cancel it before approving.',
      );
    scene.approvedAssetId = assetId;
    scene.status = 'approved';
  }
  export(experienceId: string): ExportManifest {
    this.settle();
    const experience = this.experience(experienceId);
    const assets = experience.scenes.map((scene) => {
      const asset = scene.assets.find(
        (x) => x.id === scene.approvedAssetId && x.bibleVersion === experience.bibleVersion,
      );
      if (!asset || scene.status !== 'approved')
        throw new DomainError(
          409,
          'NOT_READY',
          'Approve every scene for the current story before exporting.',
        );
      return {
        ...asset,
        title: scene.title,
        filename: `${String(scene.ordinal + 1).padStart(2, '0')}-${scene.art}-variant-${asset.variant + 1}.${asset.media === 'photo' ? 'jpg' : 'svg'}`,
      };
    });
    return {
      schema: 'wishscene.mock-export/1',
      mock: true,
      experienceId,
      title: experience.title,
      bibleVersion: experience.bibleVersion,
      destination: experience.destination,
      outfit: experience.outfit,
      mood: experience.mood,
      caption: experience.caption,
      provenance: assets.every((asset) => asset.media === 'photo')
        ? 'Pre-generated AI photo fixtures of fictional Alex Morgan. Photos match the recorded destination preset, outfit and mood. No live generation or automated likeness verification took place. Fictional experience created with wishscene.'
        : 'Illustrated developer fixtures. Custom outfit and mood inputs are metadata only and are not rendered into these illustrations. No live generation or likeness verification took place. Fictional experience created with wishscene.',
      assets,
    };
  }
}
