import { AgentivityClient } from './agentivity-client.js';
import { ChatContextApi } from './extras/chat-context-api.js';
import { AgUiBundlesApi } from './extras/ag-ui-bundles-api.js';
import { SvgIconsApi } from './extras/svg-icons-api.js';

/**
 * The full Agentivity platform client: everything in {@link AgentivityClient}
 * (entities, generic run lifecycle, HIL, conversations, folders) plus the
 * AG-UI chat channel, AG-UI widget bundle discovery, and icon assets.
 *
 * **Scope**: read, execute, and watch history. Creating or editing workflows,
 * agents, teams, or credentials is a Studio (admin) concern and deliberately
 * not exposed here.
 *
 * ## Usage
 * ```ts
 * const client = new AgentivityPlatformClient({ baseUrl: 'https://my-backend.example.com' });
 * const agents = await client.entities.fetchEntities({ kind: 'agent' });
 * const run = await client.runs.startExecution({ entityId: agents[0].id, input: 'Hello' });
 * ```
 */
export class AgentivityPlatformClient extends AgentivityClient {
  /** AG-UI chat channel: open a streaming run against a chat context/thread. */
  readonly chat: ChatContextApi;
  /** AG-UI widget bundle discovery — for apps that render generative UI. */
  readonly agUiBundles: AgUiBundlesApi;
  /** Icon assets (node icons, brand icons, embedded icons) as SVG. */
  readonly svgIcons: SvgIconsApi;

  constructor(args: { baseUrl: string; fetchImpl?: typeof fetch }) {
    super(args);
    this.chat = new ChatContextApi(this.httpCore);
    this.agUiBundles = new AgUiBundlesApi(this.httpCore);
    this.svgIcons = new SvgIconsApi(this.httpCore);
  }
}
