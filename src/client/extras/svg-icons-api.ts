import { AgentivityHttpCore } from '../http-core.js';

/** SVG icon fetching endpoints. */
export class SvgIconsApi {
  private readonly c: AgentivityHttpCore;

  constructor(c: AgentivityHttpCore) {
    this.c = c;
  }

  private async fetchSvg(path: string): Promise<string | undefined> {
    const response = await this.c.fetchImpl(this.c.resolveUrl(path), { headers: { Accept: 'image/svg+xml' } });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`SvgIconsApi: GET ${path} failed with status ${response.status}`);
    return response.text();
  }

  fetchSvgFromUrl(svgUrl: string): Promise<string | undefined> {
    const path = svgUrl.startsWith('/') ? svgUrl : `/${svgUrl}`;
    return this.fetchSvg(path);
  }

  fetchNodeIconSvg(nodeType: string): Promise<string | undefined> {
    const encoded = encodeURIComponent(nodeType.trim());
    return this.fetchSvg(AgentivityHttpCore.v1(`/metadata/nodes/${encoded}/icon.svg`));
  }

  fetchBrandIconSvg(slug: string): Promise<string | undefined> {
    const encoded = encodeURIComponent(slug.trim());
    return this.fetchSvg(`/icons/brand/${encoded}.svg`);
  }

  fetchEmbeddedIconSvg(assembly: string, name: string): Promise<string | undefined> {
    const encodedAssembly = encodeURIComponent(assembly.trim());
    const encodedName = encodeURIComponent(name.trim());
    return this.fetchSvg(`/icons/embedded/${encodedAssembly}/${encodedName}.svg`);
  }
}
