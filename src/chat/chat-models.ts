/**
 * Chat domain types — port of the Flutter SDK's `chat_models.dart`.
 *
 * v1 covers the push-based (AG-UI event-driven) shape only; the pull-based
 * `IChatProvider` REST abstraction (`loadThreads`/`openThread` against a REST
 * backend) is not yet ported — see {@link ChatController} for what's wired.
 */

// ── Attachments ───────────────────────────────────────────────────────────────

export type ChatAttachment = ImageUrlAttachment | ImageBytesAttachment | FileAttachment;

interface ChatAttachmentBase {
  name?: string;
  mimeType?: string;
}

/** Image referenced by a URL (`https://`) or data URI (`data:image/jpeg;base64,...`). */
export interface ImageUrlAttachment extends ChatAttachmentBase {
  kind: 'imageUrl';
  url: string;
}

/** Raw image bytes — encode as needed by the provider (e.g. to base64 data URI). */
export interface ImageBytesAttachment extends ChatAttachmentBase {
  kind: 'imageBytes';
  bytes: Uint8Array;
}

/** File referenced by a backend-assigned file ID. */
export interface FileAttachment extends ChatAttachmentBase {
  kind: 'file';
  fileId: string;
}

// ── Message role ──────────────────────────────────────────────────────────────

export type ChatMessageRole = 'user' | 'assistant' | 'system' | 'tool' | 'unknown';

export function chatMessageRoleFromRaw(raw: string): ChatMessageRole {
  switch (raw.trim().toLowerCase()) {
    case 'user':
      return 'user';
    case 'assistant':
      return 'assistant';
    case 'system':
      return 'system';
    case 'tool':
      return 'tool';
    default:
      return 'unknown';
  }
}

// ── Threads ───────────────────────────────────────────────────────────────────

export interface ChatThread {
  threadId: string;
  contextId: string;
  runId: string;
  title: string;
  isDefault: boolean;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ── HIL gate ──────────────────────────────────────────────────────────────────

/**
 * A pending Human-in-the-Loop gate on a chat thread.
 *
 * Set on {@link ChatController}'s `pendingHilGate` when a `CHAT_HIL_GATE_REACHED`
 * CUSTOM event or an AG-UI interrupt with `reason === 'chat_hil_gate'` is received.
 * Cleared by `clearHilGate()` or a `CHAT_HIL_RESOLVED` event.
 */
export interface ChatHilGate {
  /** Backend HIL request identifier — pass back when submitting the response. */
  requestId: string;
  /** The thread this gate belongs to. */
  threadId: string;
  /** The question / message shown to the user. */
  question: string;
  /** Display title for the gate (e.g. "Approval required"). */
  title: string;
}

// ── Content blocks ────────────────────────────────────────────────────────────

/**
 * One piece of a multi-block chat message — either free text or an AG-UI
 * interaction widget. A message with several blocks renders them in order,
 * in the same bubble.
 */
export interface ChatContentBlock {
  /** "text" for a plain-text block, or a widget type key (e.g. "ChoiceCard", "QuestionForm"). */
  type: string;
  text?: string;
  widgetProps?: Record<string, unknown>;
}

function parseContentBlock(json: Record<string, unknown>): ChatContentBlock {
  const type = String(json['type'] ?? '').trim();
  if (type === 'text') {
    return { type: 'text', text: String(json['text'] ?? '').trim() };
  }
  const props = json['widgetProps'];
  return { type, widgetProps: props && typeof props === 'object' ? (props as Record<string, unknown>) : {} };
}

/**
 * Parses a raw `blocks` value (from event payload or persisted metadata) into a
 * block list, or `undefined` when absent/empty — callers fall back to the plain
 * `text` field in that case.
 */
export function parseContentBlocks(raw: unknown): ChatContentBlock[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object').map(parseContentBlock);
}

// ── Messages ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  contextId: string;
  threadId: string;
  runId: string;
  text: string;
  authorId?: string;
  authorName?: string;
  metadata?: Record<string, unknown>;
  blocks?: ChatContentBlock[];
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}
