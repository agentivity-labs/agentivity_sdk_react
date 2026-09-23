/**
 * Message content parts and the `RunAgentInput` payload — port of
 * `run_agent_input.dart`.
 */

// ── Message content parts ────────────────────────────────────────────────────

export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; url: string; detail?: 'low' | 'high' | 'auto' }
  | { type: 'input_audio'; data: string; format: string }
  | { type: 'output_audio'; url?: string; data?: string; format?: string; transcript?: string }
  | { type: 'file'; fileId: string; mimeType?: string; name?: string };

export function messageContentPartToJson(part: MessageContentPart): Record<string, unknown> {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text };
    case 'image_url':
      return { type: 'image_url', image_url: { url: part.url, ...(part.detail ? { detail: part.detail } : {}) } };
    case 'input_audio':
      return { type: 'input_audio', input_audio: { data: part.data, format: part.format } };
    case 'output_audio':
      return {
        type: 'output_audio',
        output_audio: { ...(part.url ? { url: part.url } : {}), ...(part.data ? { data: part.data } : {}), ...(part.format ? { format: part.format } : {}), ...(part.transcript ? { transcript: part.transcript } : {}) },
      };
    case 'file':
      return { type: 'file', file: { file_id: part.fileId, ...(part.mimeType ? { mime_type: part.mimeType } : {}), ...(part.name ? { name: part.name } : {}) } };
  }
}

/**
 * Builds a message entry for `RunAgentInput.messages` supporting mixed content.
 * If `parts` are provided, the message `content` field becomes an array;
 * otherwise it is a plain string.
 */
export function buildAgUiMessage(role: string, options: { text?: string; parts?: MessageContentPart[] } = {}): Record<string, unknown> {
  const { text, parts } = options;
  if (parts && parts.length > 0) {
    const allParts: MessageContentPart[] = [...(text ? [{ type: 'text', text } as const] : []), ...parts];
    return { role, content: allParts.map(messageContentPartToJson) };
  }
  return { role, content: text ?? '' };
}

// ── RunAgentInput ─────────────────────────────────────────────────────────────

export type ResumeStatus = 'resolved' | 'cancelled';

/** One resolved or cancelled response to a single `AgUiInterrupt`. */
export interface ResumePayload {
  /** The `AgUiInterrupt.id` this payload addresses. */
  interruptId: string;
  status: ResumeStatus;
  /** Required when `status` is `'resolved'`; must satisfy the interrupt's `responseSchema` if one was provided. */
  response?: unknown;
}

function resumePayloadToJson(r: ResumePayload): Record<string, unknown> {
  return { interruptId: r.interruptId, status: r.status, ...(r.response != null ? { response: r.response } : {}) };
}

/** The payload sent to the backend to start or resume an agent run. */
export interface RunAgentInput {
  threadId: string;
  runId: string;
  /** Full conversation history — each entry is a `{role, content}` map. */
  messages?: Record<string, unknown>[];
  /** Tool definitions available to the agent for this run. */
  tools?: Record<string, unknown>[];
  /** Arbitrary context entries passed through to the agent. */
  context?: unknown[];
  /** Agent state carried over from a previous run (e.g. from `STATE_SNAPSHOT`). */
  state?: unknown;
  /** Custom props forwarded verbatim to the backend. */
  forwardedProps?: Record<string, unknown>;
  /** Resume payloads for each open interrupt from the previous run. */
  resume?: ResumePayload[];
}

export function runAgentInputToJson(input: RunAgentInput): Record<string, unknown> {
  return {
    threadId: input.threadId,
    runId: input.runId,
    messages: input.messages ?? [],
    ...(input.tools && input.tools.length > 0 ? { tools: input.tools } : {}),
    ...(input.context && input.context.length > 0 ? { context: input.context } : {}),
    ...(input.state != null ? { state: input.state } : {}),
    ...(input.forwardedProps ? { forwardedProps: input.forwardedProps } : {}),
    ...(input.resume && input.resume.length > 0 ? { resume: input.resume.map(resumePayloadToJson) } : {}),
  };
}
