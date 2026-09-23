/**
 * Frontend mirror of the server-side ExecutionContext / RunContext hierarchy.
 * An execution is the user-facing lifecycle concept; runs are internal details —
 * one execution can contain a tree of runs.
 */

// ── ExecutionContext ─────────────────────────────────────────────────────────

/**
 * Shared context for an entire execution chain (agent / team / workflow).
 * Created once when the execution starts; stable across all nested runs.
 */
export interface ExecutionContext {
  /** Correlation identifier for the execution chain. */
  executionId: string;
  /** Stable SSE channel identifier — distinct from executionId and any runId. */
  streamId: string;
  /** ID of the entity being executed (agentId | teamId | workflowId). */
  entityId: string;
  /** "agent" | "team" | "workflow" */
  entityKind: string;
}

/** Constructs the SSE stream URL from an execution's `streamId`. */
export function streamUrlFor(streamId: string): string {
  return `/api/v1/streams/${streamId}/events`;
}

export function parseExecutionContext(json: Record<string, unknown>): ExecutionContext {
  return {
    executionId: String(json['executionId'] ?? '').trim(),
    streamId: String(json['streamId'] ?? '').trim(),
    entityId: String(json['entityId'] ?? '').trim(),
    entityKind: String(json['entityKind'] ?? '').trim().toLowerCase(),
  };
}

// ── RunContext ────────────────────────────────────────────────────────────────

/** Context for one run within an execution. A single execution may contain multiple runs. */
export interface RunContext {
  /** Internal run identifier — for inspector/status polling only. */
  runId: string;
  execution: ExecutionContext;
}
