import type {
  FeedbackCreate,
  FeedbackPatch,
  FeedbackRecord,
  FeedbackReply,
} from '@wishscene/contracts';
import { DomainError } from './index';

export function createFeedback(input: FeedbackCreate, actor: string, now: string): FeedbackRecord {
  const { requestId, screenshot: _screenshot, ...data } = input;
  void _screenshot;
  return {
    ...data,
    id: requestId,
    creator: actor,
    revision: 1,
    status: 'open',
    assignee: '',
    createdAt: now,
    updatedAt: now,
    comments: [],
    voters: [],
  };
}
export function triageFeedback(
  item: FeedbackRecord,
  input: FeedbackPatch,
  now: string,
): FeedbackRecord {
  if (item.revision !== input.expectedRevision)
    throw new DomainError(
      409,
      'STALE_FEEDBACK',
      'Someone updated this item. Refresh it before saving your changes.',
    );
  if (
    item.status === input.status &&
    item.priority === input.priority &&
    item.assignee === input.assignee
  )
    return item;
  if (item.comments.length >= 200)
    throw new DomainError(409, 'THREAD_FULL', 'This thread has reached its activity limit.');
  const changes = [
    item.status !== input.status && `Status: ${item.status} → ${input.status}`,
    item.priority !== input.priority && `Priority: ${item.priority} → ${input.priority}`,
    item.assignee !== input.assignee && `Assigned to: ${input.assignee || 'Nobody'}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    ...item,
    status: input.status,
    priority: input.priority,
    assignee: input.assignee,
    revision: item.revision + 1,
    updatedAt: now,
    comments: [
      ...item.comments,
      {
        id: `${item.id}-${item.revision + 1}`,
        kind: 'activity',
        text: changes,
        author: input.author,
        createdAt: now,
      },
    ],
  };
}
export function replyToFeedback(
  item: FeedbackRecord,
  input: FeedbackReply,
  now: string,
): FeedbackRecord {
  if (item.comments.some((x) => x.id === input.requestId)) return item;
  if (item.comments.length >= 200)
    throw new DomainError(409, 'THREAD_FULL', 'This thread has reached its activity limit.');
  return {
    ...item,
    revision: item.revision + 1,
    updatedAt: now,
    comments: [
      ...item.comments,
      {
        id: input.requestId,
        author: input.author,
        text: input.text,
        kind: 'comment',
        createdAt: now,
      },
    ],
  };
}
export function voteForFeedback(
  item: FeedbackRecord,
  actor: string,
  voted: boolean,
  now: string,
): FeedbackRecord {
  if (item.voters.includes(actor) === voted) return item;
  if (voted && item.voters.length >= 2000)
    throw new DomainError(409, 'VOTE_LIMIT', 'This item has reached its vote limit.');
  return {
    ...item,
    revision: item.revision + 1,
    updatedAt: now,
    voters: voted ? [...item.voters, actor] : item.voters.filter((x) => x !== actor),
  };
}
