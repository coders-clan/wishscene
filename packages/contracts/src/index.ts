import { z } from 'zod';
import type { SceneSocial, SocialExport } from './social';
export { demoPresets, hasPhotoPreset, demoPreview } from './demo';
export * from './social';

export const destinationSchema = z.enum(['Tokyo', 'Kyoto', 'Amalfi', 'Iceland']);
export const experienceInput = z
  .object({
    title: z.string().trim().min(3).max(64),
    destination: destinationSchema,
    outfit: z.string().trim().min(3).max(100),
    mood: z.enum(['After hours', 'Slow living', 'Golden hour', 'Adventure']),
  })
  .strict();
export const storyUpdate = z
  .object({
    expectedVersion: z.number().int().positive(),
    outfit: z.string().trim().min(3).max(100),
    mood: z.enum(['After hours', 'Slow living', 'Golden hour', 'Adventure']),
  })
  .strict();
export const generationInput = z
  .object({
    requestKey: z.string().min(8).max(128),
    scenario: z.enum(['success', 'slow', 'failure']).default('success'),
  })
  .strict();
export const approvalInput = z
  .object({ assetId: z.string(), expectedVersion: z.number().int().positive() })
  .strict();
export type Destination = z.infer<typeof destinationSchema>;
export type ExperienceInput = z.infer<typeof experienceInput>;
export type StoryUpdate = z.infer<typeof storyUpdate>;
export type GenerationInput = z.infer<typeof generationInput>;
export type SceneStatus = 'draft' | 'generating' | 'review' | 'approved' | 'stale' | 'failed';
export interface Asset {
  id: string;
  sceneId: string;
  bibleVersion: number;
  image: string;
  media: 'photo' | 'illustration';
  variant: number;
  createdAt: string;
}
export interface Scene {
  id: string;
  title: string;
  shot: string;
  time: string;
  ordinal: number;
  art: string;
  status: SceneStatus;
  assets: Asset[];
  approvedAssetId: string | null;
  social: SceneSocial;
}
export interface Experience extends ExperienceInput {
  id: string;
  bibleVersion: number;
  createdAt: string;
  scenes: Scene[];
  caption: string;
}
export interface Job {
  id: string;
  experienceId: string;
  sceneId: string;
  bibleVersion: number;
  status: 'queued' | 'running' | 'ready' | 'failed' | 'cancelled';
  scenario: GenerationInput['scenario'];
  requestKey: string;
  startedAt: number;
  finishesAt: number;
  error?: string;
}
export interface Workspace {
  mode: 'mock';
  profile: { name: string; referenceCount: number; description: string };
  experiences: Experience[];
  jobs: Job[];
}
export interface ExportManifest {
  schema: 'wishscene.mock-export/1';
  mock: true;
  experienceId: string;
  title: string;
  bibleVersion: number;
  destination: Destination;
  outfit: string;
  mood: string;
  caption: string;
  provenance: string;
  assets: Array<Asset & { title: string; filename: string; social: SocialExport }>;
}
