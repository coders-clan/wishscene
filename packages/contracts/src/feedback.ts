import { z } from 'zod';

export const feedbackStatuses = ['open', 'in-progress', 'resolved', 'closed'] as const;
export const feedbackPriorities = ['low', 'normal', 'high', 'urgent'] as const;
export const feedbackCategories = ['bug', 'design', 'idea', 'question'] as const;
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
export const annotationSchema = z
  .object({
    id: z.string().uuid(),
    tool: z.enum(['rectangle', 'arrow', 'pen', 'text', 'redact']),
    color: z.enum(['#ff5263', '#8057e7', '#f7bd3e', '#19a88b']),
    points: z.array(point).min(1).max(500),
    text: z.string().max(120).optional(),
  })
  .strict();
export type Annotation = z.infer<typeof annotationSchema>;
export const feedbackTargetSchema = z
  .object({
    kind: z.enum(['element', 'region', 'page']),
    path: z
      .string()
      .max(500)
      .regex(/^\/(?!\/)[^?#\\]*$/, 'Only a page path, without query parameters, is allowed.')
      .refine(
        (value) => [...value].every((char) => char.charCodeAt(0) >= 32),
        'Invalid page path.',
      ),
    selector: z.string().max(500),
    label: z.string().max(120),
    excerpt: z.string().max(600),
    viewport: z
      .object({
        width: z.number().int().min(1).max(20000),
        height: z.number().int().min(1).max(20000),
        dpr: z.number().positive().max(10),
      })
      .strict(),
    rect: z
      .object({
        x: z.number().min(0).max(100000),
        y: z.number().min(0).max(100000),
        width: z.number().min(0).max(100000),
        height: z.number().min(0).max(100000),
      })
      .strict(),
  })
  .strict();
export type FeedbackTarget = z.infer<typeof feedbackTargetSchema>;
export const feedbackCreate = z
  .object({
    requestId: z.string().uuid(),
    author: z.string().trim().min(1).max(60),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(3).max(4000),
    category: z.enum(feedbackCategories),
    priority: z.enum(feedbackPriorities),
    target: feedbackTargetSchema,
    screenshot: z
      .string()
      .max(1500000)
      .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/)
      .nullable(),
    annotations: z.array(annotationSchema).max(50),
  })
  .strict();
export const feedbackPatch = z
  .object({
    expectedRevision: z.number().int().positive(),
    author: z.string().trim().min(1).max(60),
    status: z.enum(feedbackStatuses),
    priority: z.enum(feedbackPriorities),
    assignee: z.string().trim().max(60),
  })
  .strict();
export const feedbackReply = z
  .object({
    requestId: z.string().uuid(),
    author: z.string().trim().min(1).max(60),
    text: z.string().trim().min(1).max(2000),
  })
  .strict();
export type FeedbackCreate = z.infer<typeof feedbackCreate>;
export type FeedbackPatch = z.infer<typeof feedbackPatch>;
export type FeedbackReply = z.infer<typeof feedbackReply>;
export interface FeedbackComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  kind: 'comment' | 'activity';
}
export interface FeedbackRecord extends Omit<FeedbackCreate, 'requestId' | 'screenshot'> {
  id: string;
  revision: number;
  status: (typeof feedbackStatuses)[number];
  assignee: string;
  createdAt: string;
  updatedAt: string;
  comments: FeedbackComment[];
  voters: string[];
  creator: string;
}
export type FeedbackItem = Omit<FeedbackRecord, 'voters' | 'creator'> & {
  votes: number;
  voted: boolean;
  hasScreenshot: boolean;
};
export type FeedbackSummary = Omit<FeedbackItem, 'comments' | 'annotations' | 'target'> & {
  commentCount: number;
  target: Pick<FeedbackTarget, 'path' | 'label' | 'kind'>;
};
export interface FeedbackList {
  items: FeedbackSummary[];
  total: number;
  offset: number;
  storage: 'sqlite' | 'postgres';
}
