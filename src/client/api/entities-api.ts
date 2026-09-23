import { AgentivityHttpCore } from '../http-core.js';
import { type EntityUnit, parseEntityUnit } from '../domain/entity-models.js';
import { parseAgentSummary, parseAgenticBrowseCurrent, parseAgenticFolder, parseCatalogBrowseItem, type AgentSummary, type AgenticBrowseLevel } from '../domain/agent-models.js';
import { parseTeam, type Team } from '../domain/team-folder-models.js';
import { parseWorkflowEntity, type WorkflowEntity } from '../domain/workflow-models.js';

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return asArray(value).filter((e): e is Record<string, unknown> => !!e && typeof e === 'object');
}

/**
 * Discovery endpoints for agents, teams, and workflows — no write operations.
 */
export class EntitiesApi {
  private readonly c: AgentivityHttpCore;

  constructor(c: AgentivityHttpCore) {
    this.c = c;
  }

  // ---------------------------------------------------------------------------
  // Entity catalog
  // GET /api/v1/entities?kind=agent|team|workflow
  // ---------------------------------------------------------------------------

  async fetchEntities(options?: { kind?: string }): Promise<EntityUnit[]> {
    const data = await this.c.get<unknown[]>(AgentivityHttpCore.v1('/entities'), {
      query: options?.kind?.trim() ? { kind: options.kind.trim() } : undefined,
    });
    return asRecords(data).map(parseEntityUnit);
  }

  // ---------------------------------------------------------------------------
  // Agentic browse (read-only discovery)
  // GET /api/v1/agentic/browse
  // ---------------------------------------------------------------------------

  async fetchAgenticBrowseLevel(options?: { folderId?: string }): Promise<AgenticBrowseLevel> {
    const normalizedFolderId = this.c.normalizeNullableId(options?.folderId);
    const payload = await this.c.get<Record<string, unknown>>(AgentivityHttpCore.v1('/agentic/browse'), {
      query: normalizedFolderId ? { folderId: normalizedFolderId } : undefined,
    });
    const currentPayload = payload?.['current'];
    const current = currentPayload && typeof currentPayload === 'object' ? parseAgenticBrowseCurrent(currentPayload as Record<string, unknown>) : { folderId: undefined, name: undefined, isRoot: true };
    const folders = asRecords(payload?.['folders']).map(parseAgenticFolder);
    const items = asRecords(payload?.['items']).map(parseCatalogBrowseItem);
    return { current, folders, items };
  }

  // ---------------------------------------------------------------------------
  // Direct listing endpoints
  // ---------------------------------------------------------------------------

  async fetchAgentsList(options?: { folderId?: string }): Promise<AgentSummary[]> {
    const data = await this.c.get<unknown>(AgentivityHttpCore.v1('/agentic/agents'), {
      query: options?.folderId?.trim() ? { folderId: options.folderId.trim() } : undefined,
    });
    const items = Array.isArray(data) ? data : data && typeof data === 'object' ? (data as Record<string, unknown>)['items'] : undefined;
    return asRecords(items).map(parseAgentSummary);
  }

  async fetchTeamsList(options?: { folderId?: string }): Promise<Team[]> {
    const data = await this.c.get<unknown>(AgentivityHttpCore.v1('/agentic/teams'), {
      query: options?.folderId?.trim() ? { folderId: options.folderId.trim() } : undefined,
    });
    const items = Array.isArray(data) ? data : data && typeof data === 'object' ? (data as Record<string, unknown>)['items'] : undefined;
    return asRecords(items).map(parseTeam);
  }

  /** Note: returns identification/listing fields only — see {@link WorkflowEntity}. */
  async fetchWorkflows(): Promise<WorkflowEntity[]> {
    const data = await this.c.get<unknown[]>(AgentivityHttpCore.v1('/workflows'));
    return asRecords(data).map((json) => parseWorkflowEntity(json));
  }

  /** Note: returns identification/listing fields only — see {@link WorkflowEntity}. */
  async fetchWorkflow(id: string): Promise<WorkflowEntity> {
    const data = await this.c.get<Record<string, unknown>>(AgentivityHttpCore.v1(`/workflows/${id}`));
    return parseWorkflowEntity(data ?? {}, id);
  }
}
