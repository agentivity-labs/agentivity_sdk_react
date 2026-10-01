import { type ExecutionContext, type RunContext, parseExecutionContext, streamUrlFor } from './execution-models.js';

// ── Entity discovery ─────────────────────────────────────────────────────────

export interface PortDefinition {
  name: string;
  /** e.g. "text" | "number" | "boolean" | "text_list" | "image_ref" */
  type: string;
  description?: string;
}

function parsePortDefinition(json: Record<string, unknown>): PortDefinition {
  return {
    name: String(json['name'] ?? '').trim(),
    type: String(json['type'] ?? '').trim(),
    description: json['description'] != null ? String(json['description']) : undefined,
  };
}

function parsePortList(value: unknown): PortDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object').map(parsePortDefinition);
}

/** A discoverable agent, team, or workflow — from `GET /api/v1/entities`. */
export interface EntityUnit {
  id: string;
  displayName: string;
  /** "agent" | "team" | "workflow" */
  kind: string;
  description?: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  /** Display name of the owning folder (agents/teams only — workflows have no folders). */
  folderName?: string;
  /** Free tags set in the library (e.g. "Solution" for a white-label portal's catalog). */
  tags: string[];
}

function parseTagList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function parseEntityUnit(json: Record<string, unknown>): EntityUnit {
  return {
    id: String(json['id'] ?? '').trim(),
    displayName: String(json['displayName'] ?? json['name'] ?? '').trim(),
    kind: String(json['kind'] ?? '').trim().toLowerCase(),
    // The backend's EntityDto field is `role` (see ExecutableEntitiesEndpoints.cs), not
    // `description` — this was reading a key that never exists in the response, so
    // `description` was silently always undefined. `description` is kept as a fallback in case
    // a future/other server shape ever sends that key instead.
    description: json['role'] != null && String(json['role']).trim() !== '' ? String(json['role']) : json['description'] != null ? String(json['description']) : undefined,
    inputs: parsePortList(json['inputs']),
    outputs: parsePortList(json['outputs']),
    folderName: json['folderName'] != null ? String(json['folderName']) : undefined,
    tags: parseTagList(json['tags']),
  };
}

// ── Images (vision) ──────────────────────────────────────────────────────────

/** An image attached to an agent turn (vision) — raw base64, agent-kind executions only. */
export interface ImageAttachmentInput {
  base64Data: string;
  mimeType: string;
}

// ── Execution start ──────────────────────────────────────────────────────────

/** Response from `POST /api/v1/executions`. */
export interface SessionStartedResponse {
  /** Full run context — carries executionId, streamId, runId, entityId, entityKind. */
  runContext: RunContext;
  state: string;
  createdAt?: string;

  // Convenience accessors, mirrored from the Flutter SDK's SessionStartedResponse.
  runId: string;
  executionId: string;
  streamId: string;
  streamUrl: string;
  entityId: string;
  entityKind: string;
}

export function parseSessionStartedResponse(json: Record<string, unknown>): SessionStartedResponse {
  const executionJson = (json['execution'] ?? json) as Record<string, unknown>;
  const execution: ExecutionContext = parseExecutionContext(executionJson);
  const runId = String(json['runId'] ?? execution.executionId).trim();
  const runContext: RunContext = { runId, execution };
  return {
    runContext,
    state: String(json['state'] ?? '').trim(),
    createdAt: json['createdAt'] != null ? String(json['createdAt']) : undefined,
    runId,
    executionId: execution.executionId,
    streamId: execution.streamId,
    streamUrl: streamUrlFor(execution.streamId),
    entityId: execution.entityId,
    entityKind: execution.entityKind,
  };
}

// ── HIL (human-in-the-loop) ──────────────────────────────────────────────────

export interface HilPendingRequest {
  requestId: string;
  question?: string;
  [key: string]: unknown;
}

export interface HilPendingResponse {
  executionId: string;
  count: number;
  requests: HilPendingRequest[];
}

export function parseHilPendingResponse(json: Record<string, unknown>): HilPendingResponse {
  const raw = json['requests'];
  const requests: HilPendingRequest[] = Array.isArray(raw)
    ? raw.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object').map((r) => r as HilPendingRequest)
    : [];
  return { executionId: String(json['executionId'] ?? '').trim(), count: Number(json['count'] ?? requests.length), requests };
}

export interface HilRespondResult {
  executionId: string;
  runId: string;
  requestId: string;
  /** Typically "resumed". */
  state: string;
}

export function parseHilRespondResult(json: Record<string, unknown>): HilRespondResult {
  return {
    // Accept executionId from new contract; fall back to legacy sessionId.
    executionId: String(json['executionId'] ?? json['sessionId'] ?? '').trim(),
    runId: String(json['runId'] ?? '').trim(),
    requestId: String(json['requestId'] ?? '').trim(),
    state: String(json['state'] ?? '').trim(),
  };
}

// ── Interactions ──────────────────────────────────────────────────────────────

export interface RunInteractionResponse {
  status: string;
  runId: string;
  threadId?: string;
  messageId?: string;
  interactionRequestId?: string;
}

export function parseRunInteractionResponse(json: Record<string, unknown>): RunInteractionResponse {
  const trimmedOrUndefined = (v: unknown): string | undefined => {
    if (v == null) return undefined;
    const s = String(v).trim();
    return s.length === 0 ? undefined : s;
  };
  return {
    status: String(json['status'] ?? '').trim(),
    runId: String(json['runId'] ?? '').trim(),
    threadId: trimmedOrUndefined(json['threadId']),
    messageId: trimmedOrUndefined(json['messageId']),
    interactionRequestId: trimmedOrUndefined(json['interactionRequestId']),
  };
}

// ── Execution record ─────────────────────────────────────────────────────────

export interface ExecutionRecord {
  executionId: string;
  entityId: string;
  entityKind: string;
  state: string;
  /** channelType → threadId (e.g. `{ chat: "919d4238-..." }`) */
  channels: Record<string, string>;
  currentRunId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function parseExecutionRecord(json: Record<string, unknown>): ExecutionRecord {
  const channelsRaw = json['channels'];
  const channels: Record<string, string> = {};
  if (channelsRaw && typeof channelsRaw === 'object') {
    for (const [k, v] of Object.entries(channelsRaw as Record<string, unknown>)) {
      if (typeof v === 'string') channels[k] = v;
    }
  }
  return {
    executionId: String(json['executionId'] ?? '').trim(),
    entityId: String(json['entityId'] ?? '').trim(),
    entityKind: String(json['entityKind'] ?? '').trim(),
    state: String(json['state'] ?? '').trim(),
    channels,
    currentRunId: json['currentRunId'] != null ? String(json['currentRunId']) : undefined,
    createdAt: json['createdAt'] != null ? String(json['createdAt']) : undefined,
    updatedAt: json['updatedAt'] != null ? String(json['updatedAt']) : undefined,
  };
}

/** Convenience: the default chat thread ID if present. */
export function chatThreadId(record: ExecutionRecord): string | undefined {
  return record.channels['chat'];
}
