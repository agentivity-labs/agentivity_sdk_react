import { AgentivityHttpCore } from '../http-core.js';
import { parseInteractionThread, parseThreadMessage, type InteractionThread, type PostedThreadMessage, type ThreadMessage } from '../domain/chat-models.js';

/** Conversation history endpoints. Part of the lightweight {@link AgentivityClient}. */
export class ConversationsApi {
  private readonly c: AgentivityHttpCore;

  constructor(c: AgentivityHttpCore) {
    this.c = c;
  }

  /** `GET /api/v1/executions/{executionId}/threads` */
  async fetchExecutionThreads(executionId: string): Promise<InteractionThread[]> {
    const normalized = this.c.requireNormalizedId(executionId, 'Execution id');
    const data = await this.c.get<unknown[]>(AgentivityHttpCore.v1(`/executions/${normalized}/threads`));
    return (data ?? []).map((entry) => {
      if (entry && typeof entry === 'object') return parseInteractionThread(entry as Record<string, unknown>);
      throw new Error(`Unsupported thread payload: ${typeof entry}`);
    });
  }

  /** `GET /api/v1/executions/{executionId}/threads/{threadId}/messages` */
  async fetchExecutionThreadMessages(args: { executionId: string; threadId: string }): Promise<ThreadMessage[]> {
    const normalizedExecution = this.c.requireNormalizedId(args.executionId, 'Execution id');
    const normalizedThread = this.c.requireNormalizedId(args.threadId, 'Thread id');
    const data = await this.c.get<unknown[]>(AgentivityHttpCore.v1(`/executions/${normalizedExecution}/threads/${normalizedThread}/messages`));
    return (data ?? []).map((entry) => {
      if (entry && typeof entry === 'object') return parseThreadMessage(entry as Record<string, unknown>);
      throw new Error(`Unsupported message payload: ${typeof entry}`);
    });
  }

  /**
   * `POST /api/v1/executions/{executionId}/threads/{threadId}/messages` — writes `text` in a conversation of the
   * execution. To answer a question, name it with `RunsApi.submitHilResponse`.
   */
  async postMessage(args: { executionId: string; threadId: string; text: string; authorId?: string; authorName?: string }): Promise<PostedThreadMessage> {
    const normalizedExecution = this.c.requireNormalizedId(args.executionId, 'Execution id');
    const normalizedThread = this.c.requireNormalizedId(args.threadId, 'Thread id');
    const body: Record<string, unknown> = { text: args.text };
    if (args.authorId) body['authorId'] = args.authorId;
    if (args.authorName) body['authorName'] = args.authorName;
    const data = await this.c.post<Record<string, unknown>>(AgentivityHttpCore.v1(`/executions/${normalizedExecution}/threads/${normalizedThread}/messages`), body);
    return {
      executionId: String(data?.['executionId'] ?? '').trim(),
      threadId: String(data?.['threadId'] ?? '').trim(),
      messageId: String(data?.['messageId'] ?? '').trim(),
    };
  }
}
