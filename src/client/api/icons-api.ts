import { AgentivityHttpCore } from '../http-core.js';
import { parseIconInfo, type IconInfo } from '../../icons/icon-catalog-models.js';

/**
 * The catalog of icons a user can choose from. Generic — organised by icon set — so it serves any screen with an icon picker.
 */
export class IconsApi {
  private readonly c: AgentivityHttpCore;

  constructor(c: AgentivityHttpCore) {
    this.c = c;
  }

  /**
   * The icons of a set (all sets when `type` is omitted), optionally narrowed by search text (matched against the Material name).
   * GET /api/v1/icons?type=material&q=hotel
   */
  async fetchIcons(options?: { type?: string; q?: string }): Promise<IconInfo[]> {
    const query: Record<string, string> = {};
    if (options?.type?.trim()) query['type'] = options.type.trim();
    if (options?.q?.trim()) query['q'] = options.q.trim();
    const data = await this.c.get<unknown[]>(AgentivityHttpCore.v1('/icons'), { query: Object.keys(query).length ? query : undefined });
    return (Array.isArray(data) ? data : []).filter((e): e is Record<string, unknown> => !!e && typeof e === 'object').map(parseIconInfo);
  }
}
