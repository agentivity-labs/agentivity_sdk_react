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
  };
}
