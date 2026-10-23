/**
 * Minimal `WorkflowEntity` — port of a scoped subset of `workflow_models.dart`.
 *
 * The Flutter source models the full visual node graph (`nodes`, `connections`,
 * `annotations`, `dataTables` — ~1100 lines of node-editor types). That's
 * Studio-editor territory; this SDK's own scope statement excludes
 * administering the platform (creating/editing workflows). This type covers
 * identification/listing fields only — enough to discover and start a
 * workflow by ID. If you need the full graph structure, read it from the raw
 * JSON response yourself.
 */
export interface WorkflowEntity {
  id: string;
  name: string;
  role?: string;
  tags: string[];
  entryNode?: string;
  metadata: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  /**
   * What this workflow gives to whoever calls it (a step of another workflow, a team), next to its answer: each output,
   * its name and where its value is taken from. The output named "output" is its answer.
   */
  outputs: WorkflowOutput[];
}

/**
 * An output a workflow declares: what it gives under `name` to whoever calls it. `value` says where it is taken from, as
 * any input of a step says it (`{{step.field}}`, or a text that holds some). The output named "output" is its answer.
 */
export interface WorkflowOutput {
  name: string;
  value: string;
  description?: string;
}

/** The name of the answer of a workflow among its outputs. */
export const WORKFLOW_ANSWER_OUTPUT = 'output';

export function parseWorkflowOutput(json: Record<string, unknown>): WorkflowOutput {
  const description = typeof json['description'] === 'string' ? json['description'].trim() : undefined;
  return {
    name: (typeof json['name'] === 'string' ? json['name'] : '').trim(),
    value: typeof json['value'] === 'string' ? json['value'] : '',
    ...(description ? { description } : {}),
  };
}

function parseDateTime(value: unknown): Date | undefined {
  if (value == null) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseWorkflowEntity(json: Record<string, unknown>, fallbackId?: string): WorkflowEntity {
  return {
    id: typeof json['id'] === 'string' ? json['id'] : (fallbackId ?? ''),
    name: typeof json['name'] === 'string' ? json['name'] : (fallbackId ?? ''),
    role: typeof json['role'] === 'string' ? json['role'] : undefined,
    tags: Array.isArray(json['tags']) ? (json['tags'] as unknown[]).filter((t): t is string => typeof t === 'string') : [],
    entryNode: typeof json['entryNode'] === 'string' ? json['entryNode'] : undefined,
    metadata: json['metadata'] && typeof json['metadata'] === 'object' ? (json['metadata'] as Record<string, unknown>) : {},
    createdAt: parseDateTime(json['createdAt']),
    updatedAt: parseDateTime(json['updatedAt']),
    outputs: Array.isArray(json['outputs'])
      ? (json['outputs'] as unknown[])
          .filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object')
          .map(parseWorkflowOutput)
      : [],
  };
}
