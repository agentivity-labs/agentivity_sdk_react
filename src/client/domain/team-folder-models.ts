function normalizeOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  return normalized.length === 0 ? undefined : normalized;
}

function requireString(value: unknown): string {
  const normalized = normalizeOptionalString(value);
  if (normalized == null) throw new Error(`Required string field is null or empty: ${value}`);
  return normalized;
}

function parseDateTime(value: unknown): Date | undefined {
  const normalized = normalizeOptionalString(value);
  if (normalized == null) return undefined;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// ── Team (lightweight listing model) ─────────────────────────────────────────

export interface Team {
  teamId: string;
  teamName: string;
  role?: string;
  folderId?: string;
  /** Orchestration pattern, e.g. `"sequential"`, `"concurrent"`. */
  orchestrationType?: string;
  /** Number of member topology positions in the team. */
  memberCount: number;
  createdAtUtc?: Date;
  updatedAtUtc?: Date;
}

export function parseTeam(json: Record<string, unknown>): Team {
  return {
    teamId: requireString(json['id']),
    teamName: (normalizeOptionalString(json['name'] ?? json['teamName']) ?? '').trim(),
    role: normalizeOptionalString(json['role']),
    folderId: normalizeOptionalString(json['folderId']),
    orchestrationType: normalizeOptionalString(json['orchestrationType']),
    memberCount: typeof json['memberCount'] === 'number' ? Math.trunc(json['memberCount']) : 0,
    createdAtUtc: parseDateTime(json['createdAtUtc']),
    updatedAtUtc: parseDateTime(json['updatedAtUtc']),
  };
}

// ── TeamFolder ────────────────────────────────────────────────────────────────

export interface TeamFolder {
  objectType: string;
  teamFolderId: string;
  name: string;
  parentTeamFolderId?: string;
  createdAtUtc?: Date;
  updatedAtUtc?: Date;
}

export function parseTeamFolder(json: Record<string, unknown>): TeamFolder {
  return {
    objectType: (typeof json['type'] === 'string' ? json['type'] : 'folder').trim(),
    teamFolderId: requireString(json['id']),
    name: (typeof json['name'] === 'string' ? json['name'] : '').trim(),
    parentTeamFolderId: normalizeOptionalString(json['parentFolderId']),
    createdAtUtc: parseDateTime(json['createdAtUtc']),
    updatedAtUtc: parseDateTime(json['updatedAtUtc']),
  };
}

// ── Browse level ──────────────────────────────────────────────────────────────

export interface TeamBrowseCurrent {
  folderId?: string;
  name?: string;
  isRoot: boolean;
}

export function parseTeamBrowseCurrent(json: Record<string, unknown>): TeamBrowseCurrent {
  return { folderId: normalizeOptionalString(json['folderId']), name: normalizeOptionalString(json['name']), isRoot: json['isRoot'] === true };
}

export interface TeamBrowseLevel {
  current: TeamBrowseCurrent;
  folders: TeamFolder[];
  items: Team[];
}
