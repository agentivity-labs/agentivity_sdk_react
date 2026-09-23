import { jsonBool, jsonDateTime, jsonMap, jsonOpt, jsonStr } from '../../shared/json-helpers.js';

export interface ChatThreadSummary {
  threadId: string;
  contextId: string;
  runId: string;
  title: string;
  isDefault: boolean;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export function parseChatThreadSummary(json: Record<string, unknown>): ChatThreadSummary {
  return {
    threadId: jsonStr(json, 'id'),
    contextId: jsonStr(json, 'contextId'),
    runId: jsonStr(json, 'runId'),
    title: jsonStr(json, 'title'),
    isDefault: jsonBool(json, 'isDefault'),
    status: jsonStr(json, 'status'),
    createdAt: jsonDateTime(json, 'createdAt'),
    updatedAt: jsonDateTime(json, 'updatedAt'),
  };
}

// ── Interaction thread models — new interaction contract ────────────────────
// Source: GET /api/v1/executions/{executionId}/threads
//         GET /api/v1/executions/{executionId}/threads/{threadId}/messages

export type ThreadAuthorType = 'user' | 'agent' | 'workflow' | 'system' | 'unknown';

export function threadAuthorTypeFromRaw(raw: string): ThreadAuthorType {
  switch (raw.trim().toLowerCase()) {
    case 'user':
      return 'user';
    case 'agent':
      return 'agent';
    case 'workflow':
      return 'workflow';
    case 'system':
      return 'system';
    default:
      return 'unknown';
  }
}

/** A thread scoped to an execution. */
export interface InteractionThread {
  threadId: string;
  executionId: string;
  runId?: string;
  title: string;
  isDefault: boolean;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export function parseInteractionThread(json: Record<string, unknown>): InteractionThread {
  return {
    threadId: jsonStr(json, 'threadId'),
    executionId: jsonStr(json, 'executionId'),
    runId: jsonOpt(json, 'runId'),
    title: jsonStr(json, 'title'),
    isDefault: jsonBool(json, 'isDefault'),
    status: jsonStr(json, 'status'),
    createdAt: jsonDateTime(json, 'createdAt'),
    updatedAt: jsonDateTime(json, 'updatedAt'),
  };
}

/** A message within an interaction thread. */
export interface ThreadMessage {
  messageId: string;
  threadId: string;
  runId?: string;
  authorType: ThreadAuthorType;
  authorId?: string;
  authorName?: string;
  text: string;
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: Record<string, unknown>;
}

export function parseThreadMessage(json: Record<string, unknown>): ThreadMessage {
  return {
    messageId: jsonStr(json, 'messageId'),
    threadId: jsonStr(json, 'threadId'),
    runId: jsonOpt(json, 'runId'),
    authorType: threadAuthorTypeFromRaw(jsonStr(json, 'authorType')),
    authorId: jsonOpt(json, 'authorId'),
    authorName: jsonOpt(json, 'authorName'),
    text: jsonStr(json, 'text'),
    createdAt: jsonDateTime(json, 'createdAt'),
    updatedAt: jsonDateTime(json, 'updatedAt'),
    metadata: jsonMap(json, 'metadata'),
  };
}

/** A thread with its full message history — pairs {@link InteractionThread} with its {@link ThreadMessage} list. */
export interface InteractionThreadDetail {
  thread: InteractionThread;
  messages: ThreadMessage[];
}
