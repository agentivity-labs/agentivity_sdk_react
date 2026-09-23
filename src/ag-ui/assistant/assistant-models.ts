export type AssistantRole = 'user' | 'assistant' | 'system';

export function assistantRoleToApi(role: AssistantRole): string {
  return role;
}

export function assistantRoleFromApi(value: string): AssistantRole {
  switch (value.trim().toLowerCase()) {
    case 'assistant':
      return 'assistant';
    case 'system':
      return 'system';
    default:
      return 'user';
  }
}

/** A single message in an assistant conversation (UI-facing model). */
export interface AssistantMessage {
  role: AssistantRole;
  content: string;
  timestamp: Date;
  tokensUsed?: number;
}

export function assistantMessageToHistoryEntry(message: AssistantMessage): { role: string; content: string } {
  return { role: assistantRoleToApi(message.role), content: message.content };
}

/** Result from a non-streaming assistant call. */
export interface AssistantResult {
  message: string;
  tokensUsed?: number;
}

/** Server health/status from the assistant backend. */
export interface AssistantHealth {
  isHealthy: boolean;
  statusLabel: string;
  service: string;
  version: string;
}

/** A single chunk emitted by a streaming assistant response. */
export interface AssistantChunk {
  content?: string;
  tokensUsed?: number;
  error?: string;
  isDone: boolean;
}

export function assistantChunkHasError(chunk: AssistantChunk): boolean {
  return !!chunk.error && chunk.error.length > 0;
}

export function doneAssistantChunk(tokensUsed?: number): AssistantChunk {
  return { isDone: true, tokensUsed };
}

export function errorAssistantChunk(message: string): AssistantChunk {
  return { error: message, isDone: true };
}

// ── JSON helpers (assistant-specific: multi-key lookup) ─────────────────────

function readFirst(json: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (k in json) return json[k];
  }
  return undefined;
}

function str(v: unknown, keepWhitespace = false): string | undefined {
  if (v == null) return undefined;
  const s = String(v);
  const result = keepWhitespace ? s : s.trim();
  return result.length === 0 ? undefined : result;
}

function toInt(v: unknown): number | undefined {
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'string') {
    const n = Number.parseInt(v.trim(), 10);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function asBool(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const n = v.trim().toLowerCase();
    return n === 'true' || n === '1';
  }
  return false;
}

export function parseAssistantChunk(json: Record<string, unknown>): AssistantChunk {
  const content = readFirst(json, ['content', 'Content', 'data', 'Data']);
  const error = readFirst(json, ['error', 'Error']);
  const done = readFirst(json, ['done', 'Done', 'isDone', 'IsDone']);
  const tokens = readFirst(json, ['tokensUsed', 'TokensUsed', 'tokens']);
  return { content: str(content, true), tokensUsed: toInt(tokens), error: str(error), isDone: asBool(done) };
}
