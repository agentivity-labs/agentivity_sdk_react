import { AgentivityHttpCore } from '../http-core.js';
import { parseAgUiBundleDetail, parseAgUiBundleSummary, type AgUiBundleDetail, type AgUiBundleSummary } from './ag-ui-bundle-models.js';

/** AG-UI widget bundle endpoints. */
export class AgUiBundlesApi {
  private readonly c: AgentivityHttpCore;

  constructor(c: AgentivityHttpCore) {
    this.c = c;
  }

  async fetchAgUiBundles(): Promise<AgUiBundleSummary[]> {
    const data = await this.c.get<unknown[]>(AgentivityHttpCore.v1('/ag-ui/bundles'));
    return (data ?? []).filter((e): e is Record<string, unknown> => !!e && typeof e === 'object').map(parseAgUiBundleSummary);
  }

  async fetchAgUiBundle(bundleId: string): Promise<AgUiBundleDetail> {
    const normalizedId = this.c.requireNormalizedId(bundleId, 'Bundle id');
    const data = await this.c.get<Record<string, unknown>>(AgentivityHttpCore.v1(`/ag-ui/bundles/${normalizedId}`));
    return parseAgUiBundleDetail(data ?? {});
  }
}
