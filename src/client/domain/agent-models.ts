function nullableTrimmedString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseDateTime(value: unknown): Date | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// ── CatalogBrowseItem ─────────────────────────────────────────────────────────

/**
 * A single item in the unified `CatalogBrowseResult` returned by the
 * `/agentic/browse`, `/workflows/browse`, and `/prompts/browse` endpoints.
 * `type` discriminates between entity kinds.
 */
export interface CatalogBrowseItem {
  id: string;
  name: string;
  /** `"agent"` | `"team"` | `"workflow"` | `"prompt"` | `"folder"` */
  type: string;
  updatedAt?: Date;
  role?: string;
  folderId?: string;
}

export function isAgentBrowseItem(item: CatalogBrowseItem): boolean {
  return item.type === 'agent';
}
export function isTeamBrowseItem(item: CatalogBrowseItem): boolean {
  return item.type === 'team';
}
export function isWorkflowBrowseItem(item: CatalogBrowseItem): boolean {
  return item.type === 'workflow';
}
export function isPromptBrowseItem(item: CatalogBrowseItem): boolean {
  return item.type === 'prompt';
}

export function parseCatalogBrowseItem(json: Record<string, unknown>): CatalogBrowseItem {
  return {
    id: (typeof json['id'] === 'string' ? json['id'] : '').trim(),
    name: (typeof json['name'] === 'string' ? json['name'] : '').trim(),
    type: (typeof json['type'] === 'string' ? json['type'] : '').trim().toLowerCase(),
    updatedAt: parseDateTime(json['updatedAt']),
    role: nullableTrimmedString(json['role']),
    folderId: nullableTrimmedString(json['folderId']),
  };
}

// ── AgentSummary ──────────────────────────────────────────────────────────────

/** Summary returned by `GET /agentic/agents?folderId={id}`. */
export interface AgentSummary {
  id: string;
  name: string;
  tags: string[];
  folderId?: string;
  updatedAt?: Date;
}

export function parseAgentSummary(json: Record<string, unknown>): AgentSummary {
  const rawTags = json['tags'];
  const tags = Array.isArray(rawTags) ? rawTags.map((t) => String(t).trim()).filter((t) => t.length > 0) : [];
  return {
    id: (typeof json['id'] === 'string' ? json['id'] : '').trim(),
    name: (typeof json['name'] === 'string' ? json['name'] : '').trim(),
    tags,
    folderId: nullableTrimmedString(json['folderId']),
    updatedAt: parseDateTime(json['updatedAt']),
  };
}

// ── AgenticFolder (returned by CRUD endpoints — not browse) ──────────────────

/**
 * Folder returned by the `/agentic/folders` CRUD endpoints. The browse
 * endpoint returns a different (leaner) shape handled by
 * {@link CatalogBrowseItem} with `type === "folder"`.
 */
export interface AgenticFolder {
  folderId: string;
  name: string;
  parentFolderId?: string;
  createdAtUtc?: Date;
  updatedAtUtc?: Date;
}

export function parseAgenticFolder(json: Record<string, unknown>): AgenticFolder {
  // CRUD endpoint returns a WorkspaceFolder shape with 'folderId'.
  // Browse endpoint (CatalogBrowseFolder) uses 'id' — handled separately.
  const folderId = nullableTrimmedString(json['folderId']) ?? nullableTrimmedString(json['id']) ?? '';
  return {
    folderId,
    name: (typeof json['name'] === 'string' ? json['name'] : '').trim(),
    parentFolderId: nullableTrimmedString(json['parentFolderId']),
    createdAtUtc: parseDateTime(json['createdAtUtc']),
    updatedAtUtc: parseDateTime(json['updatedAtUtc']),
  };
}

// ── AgenticBrowseCurrent / AgenticBrowseLevel ────────────────────────────────

export interface AgenticBrowseCurrent {
  folderId?: string;
  name?: string;
  isRoot: boolean;
}

export function parseAgenticBrowseCurrent(json: Record<string, unknown>): AgenticBrowseCurrent {
  return { folderId: nullableTrimmedString(json['folderId']), name: nullableTrimmedString(json['name']), isRoot: json['isRoot'] === true };
}

export interface AgenticBrowseLevel {
  current: AgenticBrowseCurrent;
  /** Folders at this level — sourced from `CatalogBrowseResult.folders`. */
  folders: AgenticFolder[];
  /** Items at this level — agents and teams mixed, discriminated by `CatalogBrowseItem.type`. */
  items: CatalogBrowseItem[];
}
