/**
 * AG-UI standard event types.
 *
 * Based on the AG-UI open protocol spec: https://docs.ag-ui.com/concepts/events
 *
 * Parse raw SSE frames with {@link parseAgUiEvent}, or use the ready-made
 * {@link agUiEventParser} with {@link AgUiSseChannel}.
 */

// ── Base shape ──────────────────────────────────────────────────────────────

interface AgUiEventBase {
  type: string;
  /** Unix timestamp in milliseconds, if provided by the backend. */
  timestamp?: number;
  /** Agentivity execution ID, forwarded by the backend on every event. */
  executionId?: string;
}

// ── Run lifecycle ────────────────────────────────────────────────────────────

export interface AgUiInterrupt {
  id: string;
  reason: string;
  message?: string;
  toolCallId?: string;
  /** JSON Schema describing the shape of the expected resume payload. */
  responseSchema?: Record<string, unknown>;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export type AgUiRunOutcome =
  | { kind: 'success' }
  | { kind: 'interrupt'; interrupts: AgUiInterrupt[] };

export interface RunStartedEvent extends AgUiEventBase {
  type: 'RUN_STARTED';
  threadId?: string;
  runId: string;
  parentRunId?: string;
  input?: Record<string, unknown>;
}

/** A run completed. Check `outcome` for success vs interrupt. */
export interface RunFinishedEvent extends AgUiEventBase {
  type: 'RUN_FINISHED';
  threadId?: string;
  runId: string;
  /** `undefined` = legacy success (no outcome field in payload). */
  outcome?: AgUiRunOutcome;
  result?: unknown;
}

export interface RunErrorEvent extends AgUiEventBase {
  type: 'RUN_ERROR';
  message: string;
  code?: string;
}

export function isRunFinishedInterrupted(event: RunFinishedEvent): boolean {
  return event.outcome?.kind === 'interrupt';
}

// ── Step lifecycle ───────────────────────────────────────────────────────────

export interface StepStartedEvent extends AgUiEventBase {
  type: 'STEP_STARTED';
  stepName: string;
  /** Present when the step belongs to a Team member — the entity id of that member. */
  memberEntityId?: string;
  /** Present when the step belongs to a Team member — 'agent' | 'workflow' | ... */
  memberEntityKind?: string;
  /** Human-friendly name for the active member, falls back to `memberEntityId` when unset. */
  displayName?: string;
}

export interface StepFinishedEvent extends AgUiEventBase {
  type: 'STEP_FINISHED';
  stepName: string;
  memberEntityId?: string;
  memberEntityKind?: string;
  displayName?: string;
}

// ── Text messages — streaming ────────────────────────────────────────────────

export interface TextMessageStartEvent extends AgUiEventBase {
  type: 'TEXT_MESSAGE_START';
  messageId: string;
  role: string;
  name?: string;
}

export interface TextMessageContentEvent extends AgUiEventBase {
  type: 'TEXT_MESSAGE_CONTENT';
  messageId: string;
  delta: string;
}

export interface TextMessageEndEvent extends AgUiEventBase {
  type: 'TEXT_MESSAGE_END';
  messageId: string;
}

/** Convenience single-event alternative to START + CONTENT + END. */
export interface TextMessageChunkEvent extends AgUiEventBase {
  type: 'TEXT_MESSAGE_CHUNK';
  messageId?: string;
  role?: string;
  delta?: string;
  name?: string;
}

// ── Tool calls — streaming ───────────────────────────────────────────────────

export interface ToolCallStartEvent extends AgUiEventBase {
  type: 'TOOL_CALL_START';
  toolCallId: string;
  toolCallName: string;
  parentMessageId?: string;
}

/** Args delta — event type is `TOOL_CALL_ARGS` in the spec (legacy: `TOOL_CALL_ARGS_DELTA`). */
export interface ToolCallArgsDeltaEvent extends AgUiEventBase {
  type: 'TOOL_CALL_ARGS' | 'TOOL_CALL_ARGS_DELTA';
  toolCallId: string;
  delta: string;
}

export interface ToolCallEndEvent extends AgUiEventBase {
  type: 'TOOL_CALL_END';
  toolCallId: string;
}

/** Convenience combined chunk (start + args + end in one event). */
export interface ToolCallChunkEvent extends AgUiEventBase {
  type: 'TOOL_CALL_CHUNK';
  toolCallId?: string;
  toolCallName?: string;
  parentMessageId?: string;
  delta?: string;
}

/** Result of a tool call. `content` is always a string (JSON-encoded for complex results). */
export interface ToolCallResultEvent extends AgUiEventBase {
  type: 'TOOL_CALL_RESULT';
  messageId: string;
  toolCallId: string;
  content: string;
  role?: string;
}

// ── Thinking / extended reasoning ────────────────────────────────────────────
//
// Spec names: THINKING_START, THINKING_END, THINKING_TEXT_MESSAGE_START/CONTENT/END
// (https://docs.ag-ui.com/concepts/events). A not-yet-updated backend may still emit
// legacy REASONING_* wire names — parseAgUiEvent tolerates both, but always produces
// the spec-aligned `type` below.

export interface ThinkingStartEvent extends AgUiEventBase {
  type: 'THINKING_START';
  messageId: string;
}

export interface ThinkingTextMessageStartEvent extends AgUiEventBase {
  type: 'THINKING_TEXT_MESSAGE_START';
  messageId: string;
  role: string;
}

export interface ThinkingTextMessageContentEvent extends AgUiEventBase {
  type: 'THINKING_TEXT_MESSAGE_CONTENT';
  messageId: string;
  delta: string;
}

export interface ThinkingTextMessageEndEvent extends AgUiEventBase {
  type: 'THINKING_TEXT_MESSAGE_END';
  messageId: string;
}

export interface ThinkingEndEvent extends AgUiEventBase {
  type: 'THINKING_END';
  messageId: string;
}

/** Convenience combined chunk (alternative to THINKING_TEXT_MESSAGE_START + CONTENT + END). */
export interface ThinkingTextMessageChunkEvent extends AgUiEventBase {
  type: 'THINKING_TEXT_MESSAGE_CHUNK';
  messageId?: string;
  delta?: string;
}

/** Encrypted reasoning value for safety filtering of extended-thinking content. */
export interface ThinkingEncryptedValueEvent extends AgUiEventBase {
  type: 'THINKING_ENCRYPTED_VALUE';
  /** `"tool-call"` or `"message"`. */
  subtype: string;
  entityId: string;
  encryptedValue: string;
}

// ── State ─────────────────────────────────────────────────────────────────────

export interface StateSnapshotEvent extends AgUiEventBase {
  type: 'STATE_SNAPSHOT';
  snapshot: unknown;
}

/** `delta` is a list of RFC 6902 JSON Patch operations. */
export interface StateDeltaEvent extends AgUiEventBase {
  type: 'STATE_DELTA';
  delta: unknown[];
}

// ── Messages ─────────────────────────────────────────────────────────────────

export interface MessagesSnapshotEvent extends AgUiEventBase {
  type: 'MESSAGES_SNAPSHOT';
  messages: Record<string, unknown>[];
}

// ── Activity (Agentivity extension — not part of the AG-UI spec) ────────────
//
// ACTIVITY_SNAPSHOT/ACTIVITY_DELTA are Agentivity-platform-specific additions to
// the core AG-UI event set, used to stream free-form "activity" content (e.g. a live
// research/browsing trace) alongside the spec's own events. A backend implementing
// only the official AG-UI spec will never emit these.

export interface ActivitySnapshotEvent extends AgUiEventBase {
  type: 'ACTIVITY_SNAPSHOT';
  messageId: string;
  activityType: string;
  content: Record<string, unknown>;
  replace: boolean;
}

export interface ActivityDeltaEvent extends AgUiEventBase {
  type: 'ACTIVITY_DELTA';
  messageId: string;
  activityType: string;
  /** RFC 6902 JSON Patch operations applied to the activity content. */
  patch: unknown[];
}

export const AGENTIVITY_EXTENSION_EVENT_TYPES = new Set(['ACTIVITY_SNAPSHOT', 'ACTIVITY_DELTA']);

export function isAgentivityExtensionEvent(event: AgUiEvent): event is ActivitySnapshotEvent | ActivityDeltaEvent {
  return AGENTIVITY_EXTENSION_EVENT_TYPES.has(event.type);
}

// ── Raw / custom / unknown ───────────────────────────────────────────────────

export interface RawEvent extends AgUiEventBase {
  type: 'RAW';
  event: unknown;
  source?: string;
}

export interface CustomEvent extends AgUiEventBase {
  type: 'CUSTOM';
  name: string;
  value?: unknown;
}

export interface UnknownEvent extends AgUiEventBase {
  type: 'UNKNOWN';
  /** The original, unrecognized wire event type. */
  wireType: string;
  raw: Record<string, unknown>;
}

// ── Union ─────────────────────────────────────────────────────────────────────

export type AgUiEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepStartedEvent
  | StepFinishedEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | TextMessageChunkEvent
  | ToolCallStartEvent
  | ToolCallArgsDeltaEvent
  | ToolCallEndEvent
  | ToolCallChunkEvent
  | ToolCallResultEvent
  | ThinkingStartEvent
  | ThinkingTextMessageStartEvent
  | ThinkingTextMessageContentEvent
  | ThinkingTextMessageEndEvent
  | ThinkingEndEvent
  | ThinkingTextMessageChunkEvent
  | ThinkingEncryptedValueEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | MessagesSnapshotEvent
  | ActivitySnapshotEvent
  | ActivityDeltaEvent
  | RawEvent
  | CustomEvent
  | UnknownEvent;

// ── Parsing helpers ──────────────────────────────────────────────────────────

function str(json: Record<string, unknown>, key: string): string {
  const v = json[key];
  if (typeof v === 'string') return v;
  if (v != null) return String(v);
  return '';
}

function opt(json: Record<string, unknown>, key: string): string | undefined {
  const v = json[key];
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length === 0 ? undefined : s;
}

function parseIntSafe(v: unknown): number | undefined {
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'string') {
    const n = Number.parseInt(v.trim(), 10);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function parseOutcome(raw: unknown): AgUiRunOutcome | undefined {
  if (raw == null) return undefined;
  const map = asRecord(raw);
  if (!map) return { kind: 'success' };
  if (map['type'] === 'interrupt') {
    const rawInterrupts = map['interrupts'];
    const interrupts: AgUiInterrupt[] = Array.isArray(rawInterrupts)
      ? rawInterrupts.filter((i): i is Record<string, unknown> => asRecord(i) != null).map((i) => parseInterrupt(i))
      : [];
    return { kind: 'interrupt', interrupts };
  }
  return { kind: 'success' };
}

function parseInterrupt(json: Record<string, unknown>): AgUiInterrupt {
  return {
    id: String(json['id'] ?? json['interruptId'] ?? ''),
    reason: String(json['reason'] ?? ''),
    message: json['message'] != null ? String(json['message']) : undefined,
    toolCallId: json['toolCallId'] != null ? String(json['toolCallId']) : undefined,
    responseSchema: asRecord(json['responseSchema']),
    expiresAt: json['expiresAt'] != null ? String(json['expiresAt']) : undefined,
    metadata: asRecord(json['metadata']),
  };
}

/**
 * Parses a raw AG-UI event envelope (already-decoded JSON) into a typed {@link AgUiEvent}.
 * Prefer {@link agUiEventParser} for consuming raw SSE frames.
 */
export function parseAgUiEvent(json: Record<string, unknown>): AgUiEvent {
  const type = str(json, 'type');
  const timestamp = parseIntSafe(json['timestamp']);
  const executionId = opt(json, 'executionId');
  const base = { timestamp, executionId };

  switch (type) {
    // Run lifecycle
    case 'RUN_STARTED':
      return {
        ...base,
        type: 'RUN_STARTED',
        threadId: opt(json, 'threadId'),
        runId: str(json, 'runId'),
        parentRunId: opt(json, 'parentRunId'),
        input: asRecord(json['input']),
      };
    case 'RUN_FINISHED':
      return {
        ...base,
        type: 'RUN_FINISHED',
        threadId: opt(json, 'threadId'),
        runId: str(json, 'runId'),
        outcome: parseOutcome(json['outcome']),
        result: json['result'],
      };
    case 'RUN_ERROR':
      return { ...base, type: 'RUN_ERROR', message: str(json, 'message'), code: opt(json, 'code') };

    // Steps
    case 'STEP_STARTED':
      return { ...base, type: 'STEP_STARTED', stepName: str(json, 'stepName'), memberEntityId: opt(json, 'memberEntityId'), memberEntityKind: opt(json, 'memberEntityKind'), displayName: opt(json, 'displayName') };
    case 'STEP_FINISHED':
      return { ...base, type: 'STEP_FINISHED', stepName: str(json, 'stepName'), memberEntityId: opt(json, 'memberEntityId'), memberEntityKind: opt(json, 'memberEntityKind'), displayName: opt(json, 'displayName') };

    // Text messages — streaming
    case 'TEXT_MESSAGE_START':
      return {
        ...base,
        type: 'TEXT_MESSAGE_START',
        messageId: str(json, 'messageId'),
        role: str(json, 'role') || 'assistant',
        name: opt(json, 'name'),
      };
    case 'TEXT_MESSAGE_CONTENT':
      return { ...base, type: 'TEXT_MESSAGE_CONTENT', messageId: str(json, 'messageId'), delta: str(json, 'delta') };
    case 'TEXT_MESSAGE_END':
      return { ...base, type: 'TEXT_MESSAGE_END', messageId: str(json, 'messageId') };
    case 'TEXT_MESSAGE_CHUNK':
      return {
        ...base,
        type: 'TEXT_MESSAGE_CHUNK',
        messageId: opt(json, 'messageId'),
        role: opt(json, 'role'),
        delta: opt(json, 'delta'),
        name: opt(json, 'name'),
      };

    // Tool calls — streaming
    case 'TOOL_CALL_START':
      return {
        ...base,
        type: 'TOOL_CALL_START',
        toolCallId: str(json, 'toolCallId'),
        // spec: toolCallName; tolerate legacy toolName
        toolCallName: str(json, 'toolCallName') || str(json, 'toolName'),
        parentMessageId: opt(json, 'parentMessageId'),
      };
    // TOOL_CALL_ARGS is the spec name; tolerate legacy TOOL_CALL_ARGS_DELTA
    case 'TOOL_CALL_ARGS':
    case 'TOOL_CALL_ARGS_DELTA':
      return { ...base, type: 'TOOL_CALL_ARGS', toolCallId: str(json, 'toolCallId'), delta: str(json, 'delta') };
    case 'TOOL_CALL_END':
      return { ...base, type: 'TOOL_CALL_END', toolCallId: str(json, 'toolCallId') };
    case 'TOOL_CALL_CHUNK':
      return {
        ...base,
        type: 'TOOL_CALL_CHUNK',
        toolCallId: opt(json, 'toolCallId'),
        toolCallName: opt(json, 'toolCallName'),
        parentMessageId: opt(json, 'parentMessageId'),
        delta: opt(json, 'delta'),
      };
    case 'TOOL_CALL_RESULT':
      return {
        ...base,
        type: 'TOOL_CALL_RESULT',
        messageId: str(json, 'messageId'),
        toolCallId: str(json, 'toolCallId'),
        // spec: content (string); tolerate legacy result
        content: str(json, 'content') || (json['result'] != null ? String(json['result']) : ''),
        role: opt(json, 'role'),
      };

    // Thinking / extended reasoning — tolerate legacy REASONING_* wire names
    case 'THINKING_START':
    case 'REASONING_START':
      return { ...base, type: 'THINKING_START', messageId: str(json, 'messageId') };
    case 'THINKING_TEXT_MESSAGE_START':
    case 'REASONING_MESSAGE_START':
      return {
        ...base,
        type: 'THINKING_TEXT_MESSAGE_START',
        messageId: str(json, 'messageId'),
        role: str(json, 'role') || 'reasoning',
      };
    case 'THINKING_TEXT_MESSAGE_CONTENT':
    case 'REASONING_MESSAGE_CONTENT':
      return {
        ...base,
        type: 'THINKING_TEXT_MESSAGE_CONTENT',
        messageId: str(json, 'messageId'),
        delta: str(json, 'delta'),
      };
    case 'THINKING_TEXT_MESSAGE_END':
    case 'REASONING_MESSAGE_END':
      return { ...base, type: 'THINKING_TEXT_MESSAGE_END', messageId: str(json, 'messageId') };
    case 'THINKING_END':
    case 'REASONING_END':
      return { ...base, type: 'THINKING_END', messageId: str(json, 'messageId') };
    case 'THINKING_TEXT_MESSAGE_CHUNK':
    case 'REASONING_MESSAGE_CHUNK':
      return {
        ...base,
        type: 'THINKING_TEXT_MESSAGE_CHUNK',
        messageId: opt(json, 'messageId'),
        delta: opt(json, 'delta'),
      };
    case 'THINKING_ENCRYPTED_VALUE':
    case 'REASONING_ENCRYPTED_VALUE':
      return {
        ...base,
        type: 'THINKING_ENCRYPTED_VALUE',
        subtype: str(json, 'subtype'),
        entityId: str(json, 'entityId'),
        encryptedValue: str(json, 'encryptedValue'),
      };

    // State
    case 'STATE_SNAPSHOT':
      return { ...base, type: 'STATE_SNAPSHOT', snapshot: json['snapshot'] };
    case 'STATE_DELTA':
      return { ...base, type: 'STATE_DELTA', delta: Array.isArray(json['delta']) ? (json['delta'] as unknown[]) : [] };

    // Messages
    case 'MESSAGES_SNAPSHOT':
      return {
        ...base,
        type: 'MESSAGES_SNAPSHOT',
        messages: Array.isArray(json['messages'])
          ? (json['messages'] as unknown[]).filter((m): m is Record<string, unknown> => asRecord(m) != null)
          : [],
      };

    // Activity — Agentivity extension
    case 'ACTIVITY_SNAPSHOT':
      return {
        ...base,
        type: 'ACTIVITY_SNAPSHOT',
        messageId: str(json, 'messageId'),
        activityType: str(json, 'activityType'),
        content: asRecord(json['content']) ?? {},
        replace: json['replace'] !== false,
      };
    case 'ACTIVITY_DELTA':
      return {
        ...base,
        type: 'ACTIVITY_DELTA',
        messageId: str(json, 'messageId'),
        activityType: str(json, 'activityType'),
        patch: Array.isArray(json['patch']) ? (json['patch'] as unknown[]) : [],
      };

    // Raw / custom
    case 'RAW':
      return { ...base, type: 'RAW', event: json['event'], source: opt(json, 'source') };
    case 'CUSTOM':
      return { ...base, type: 'CUSTOM', name: str(json, 'name'), value: json['value'] };

    default:
      return { ...base, type: 'UNKNOWN', wireType: type, raw: json };
  }
}

/**
 * Drop-in parser for `AgUiSseChannel<AgUiEvent>`:
 *
 * ```ts
 * new AgUiSseChannel<AgUiEvent>({
 *   opener: myOpener,
 *   path: '/agent/stream',
 *   parser: agUiEventParser,
 * });
 * ```
 */
export function agUiEventParser(event: string, _id: string | undefined, data: string | undefined): AgUiEvent | undefined {
  if (!data || data === '[DONE]') return undefined;
  try {
    const decoded: unknown = JSON.parse(data);
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return undefined;
    const json = decoded as Record<string, unknown>;
    if (!('type' in json) && event) {
      json['type'] = event;
    }
    return parseAgUiEvent(json);
  } catch {
    return undefined;
  }
}
