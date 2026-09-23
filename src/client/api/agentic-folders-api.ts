import { AgentivityHttpCore } from '../http-core.js';
import { parseAgenticFolder, type AgenticFolder } from '../domain/agent-models.js';

/** Agentic folder management (shared container for agents and teams). Part of the lightweight {@link AgentivityClient}. */
export class AgenticFoldersApi {
  private readonly c: AgentivityHttpCore;

  constructor(c: AgentivityHttpCore) {
    this.c = c;
  }

  async createAgenticFolder(args: { name: string; parentFolderId?: string }): Promise<AgenticFolder> {
    const normalizedName = args.name.trim();
    if (!normalizedName) throw new Error('Folder name is required');
    const data = await this.c.post<Record<string, unknown>>(AgentivityHttpCore.v1('/agentic/folders'), {
      name: normalizedName,
      parentFolderId: this.c.normalizeNullableId(args.parentFolderId),
    });
    return parseAgenticFolder(data ?? {});
  }

  async renameAgenticFolder(args: { folderId: string; name: string }): Promise<void> {
    const normalizedFolderId = this.c.requireNormalizedId(args.folderId, 'Folder id');
    const normalizedName = args.name.trim();
    if (!normalizedName) throw new Error('Folder name is required');
    const data = await this.c.post<Record<string, unknown>>(AgentivityHttpCore.v1(`/agentic/folders/${normalizedFolderId}/rename`), { name: normalizedName });
    this.c.expectSuccessOrEmptyResponse(data, 'Rename agentic folder');
  }

  async deleteAgenticFolder(folderId: string): Promise<void> {
    const normalizedFolderId = this.c.requireNormalizedId(folderId, 'Folder id');
    await this.c.delete<void>(AgentivityHttpCore.v1(`/agentic/folders/${normalizedFolderId}`));
  }

  async moveAgenticFolder(args: { folderId: string; targetParentFolderId?: string }): Promise<void> {
    const normalizedFolderId = this.c.requireNormalizedId(args.folderId, 'Folder id');
    const data = await this.c.post<Record<string, unknown>>(AgentivityHttpCore.v1(`/agentic/folders/${normalizedFolderId}/move`), {
      targetParentFolderId: this.c.normalizeNullableId(args.targetParentFolderId),
    });
    this.c.expectSuccessOrEmptyResponse(data, 'Move agentic folder');
  }
}
