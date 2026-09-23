import { AgentivityHttpCore } from './http-core.js';
import { EntitiesApi } from './api/entities-api.js';
import { RunsApi } from './api/runs-api.js';
import { VoiceApi } from './api/voice-api.js';
import { ConversationsApi } from './api/conversations-api.js';
import { AgenticFoldersApi } from './api/agentic-folders-api.js';
import { DataTablesApi } from './api/datatables-api.js';

/**
 * Lightweight Agentivity client for building applications on top of an
 * Agentivity backend.
 *
 * Covers discovery, run lifecycle, HIL, and voice — everything needed to
 * launch and drive agents/teams/workflows without depending on Studio-only
 * management features (creating/editing workflows, agents, teams, or
 * credentials stays inside Agentivity Studio).
 *
 * ## Usage
 * ```ts
 * const client = new AgentivityClient({ baseUrl: 'https://my-backend.example.com' });
 * const entities = await client.entities.fetchEntities({ kind: 'agent' });
 * const run = await client.runs.startExecution({ entityId: entities[0].id, input: 'Hello' });
 * ```
 */
export class AgentivityClient {
  private readonly http: AgentivityHttpCore;

  /** Entity discovery: list and browse agents, teams, and workflows. */
  readonly entities: EntitiesApi;
  /** Run lifecycle: start executions, manage HIL, send interactions, open SSE streams. */
  readonly runs: RunsApi;
  /** Server-side voice transcription for chat dictation. */
  readonly voice: VoiceApi;
  /** Conversation history: execution threads and messages. */
  readonly conversations: ConversationsApi;
  /** Agentic folder management: create, rename, move, and delete folders. */
  readonly agenticFolders: AgenticFoldersApi;
  /** Shared Data Table rows — read what a Team's workflow wrote, or write back where the app owns the data. */
  readonly dataTables: DataTablesApi;

  constructor(args: { baseUrl: string; fetchImpl?: typeof fetch }) {
    this.http = new AgentivityHttpCore(args);
    this.entities = new EntitiesApi(this.http);
    this.runs = new RunsApi(this.http);
    this.voice = new VoiceApi(this.http);
    this.conversations = new ConversationsApi(this.http);
    this.agenticFolders = new AgenticFoldersApi(this.http);
    this.dataTables = new DataTablesApi(this.http);
  }

  /** Exposes the underlying HTTP core — for advanced use only. */
  get httpCore(): AgentivityHttpCore {
    return this.http;
  }
}
