import { apiHttpStatus, debugLogApiIssue, userFacingErrorMessage } from '../../client/api-contract.js';
import { assistantMessageToHistoryEntry, assistantChunkHasError, type AssistantMessage } from './assistant-models.js';
import type { IAssistantProvider } from './i-assistant-provider.js';

type Listener = () => void;

/**
 * Drives an assistant conversation against an {@link IAssistantProvider} —
 * port of `AssistantController`. Prefers `provider.stream`; falls back to
 * `provider.send` (non-streaming) when the backend returns 404/405/501 for
 * the streaming endpoint.
 */
export class AssistantController {
  private readonly provider: IAssistantProvider;
  private readonly listeners = new Set<Listener>();

  private messagesValue: AssistantMessage[] = [];
  private isSendingValue = false;
  private isOnlineValue = false;
  private isCheckingHealthValue = false;
  private hasCheckedHealthValue = false;
  private errorMessageValue: string | undefined;
  private statusLabelValue = 'unknown';
  private lastResponseTokensValue: number | undefined;

  constructor(args: { provider: IAssistantProvider }) {
    this.provider = args.provider;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  get messages(): AssistantMessage[] {
    return this.messagesValue;
  }
  get isSending(): boolean {
    return this.isSendingValue;
  }
  get isOnline(): boolean {
    return this.isOnlineValue;
  }
  get isCheckingHealth(): boolean {
    return this.isCheckingHealthValue;
  }
  get hasCheckedHealth(): boolean {
    return this.hasCheckedHealthValue;
  }
  get errorMessage(): string | undefined {
    return this.errorMessageValue;
  }
  get statusLabel(): string {
    return this.statusLabelValue;
  }
  get lastResponseTokens(): number | undefined {
    return this.lastResponseTokensValue;
  }

  async checkHealth(): Promise<void> {
    if (this.isCheckingHealthValue) return;
    this.isCheckingHealthValue = true;
    this.errorMessageValue = undefined;
    this.notify();
    try {
      const health = await this.provider.checkHealth();
      this.isOnlineValue = health.isHealthy;
      this.statusLabelValue = health.statusLabel;
      this.hasCheckedHealthValue = true;
    } catch (error) {
      debugLogApiIssue(error, { operation: 'AssistantController.checkHealth' });
      this.isOnlineValue = false;
      this.hasCheckedHealthValue = true;
      this.errorMessageValue = userFacingErrorMessage(error);
      this.appendSystem('Assistant unreachable. Try again shortly.');
    } finally {
      this.isCheckingHealthValue = false;
      this.notify();
    }
  }

  /**
   * Sends `content` to the assistant. `context` is optional caller-provided
   * data forwarded verbatim to the backend (e.g. a serialized workflow) —
   * not inspected by this controller.
   */
  async sendMessage(args: { content: string; context?: Record<string, unknown> }): Promise<void> {
    const trimmed = args.content.trim();
    if (!trimmed || this.isSendingValue) return;

    const previous = [...this.messagesValue];
    const history = previous.map(assistantMessageToHistoryEntry);

    this.messagesValue = [...previous, { role: 'user', content: trimmed, timestamp: new Date() }];
    this.isSendingValue = true;
    this.errorMessageValue = undefined;
    this.notify();

    const baseMessages = [...this.messagesValue];

    try {
      const tokensUsed = await this.streamResponse({ message: trimmed, history, context: args.context, baseMessages });
      this.isOnlineValue = true;
      this.lastResponseTokensValue = tokensUsed;
    } catch (error) {
      if (this.shouldFallback(error)) {
        this.messagesValue = [...baseMessages];
        this.notify();
        await this.sendLegacy({ message: trimmed, history, context: args.context, baseMessages });
        return;
      }
      this.handleError(error, baseMessages);
    } finally {
      this.isSendingValue = false;
      this.notify();
    }
  }

  private streamResponse(args: { message: string; history: { role: string; content: string }[]; context?: Record<string, unknown>; baseMessages: AssistantMessage[] }): Promise<number | undefined> {
    return new Promise((resolve, reject) => {
      let draft: AssistantMessage | undefined;
      let working = [...args.baseMessages];
      let tokensUsed: number | undefined;
      let settled = false;

      const unsubscribe = this.provider.stream({ message: args.message, history: args.history, context: args.context }, (chunk) => {
        if (settled) return;
        if (assistantChunkHasError(chunk)) {
          settled = true;
          unsubscribe();
          reject(new Error(chunk.error));
          return;
        }

        if (chunk.content) {
          const updated: AssistantMessage = { role: 'assistant', content: (draft?.content ?? '') + chunk.content, timestamp: draft?.timestamp ?? new Date(), tokensUsed: draft?.tokensUsed };
          draft = updated;
          working = working.length > args.baseMessages.length ? replaceLast(working, updated) : [...working, updated];
          this.messagesValue = working;
          this.notify();
        }

        if (chunk.tokensUsed != null) tokensUsed = chunk.tokensUsed;

        if (chunk.isDone) {
          settled = true;
          unsubscribe();
          if (draft && tokensUsed != null) {
            this.messagesValue = replaceLast(working, { ...draft, tokensUsed });
            this.notify();
          }
          if (!draft) {
            reject(new Error('Stream ended without content.'));
            return;
          }
          resolve(tokensUsed);
        }
      });
    });
  }

  private async sendLegacy(args: { message: string; history: { role: string; content: string }[]; context?: Record<string, unknown>; baseMessages: AssistantMessage[] }): Promise<void> {
    try {
      const result = await this.provider.send({ message: args.message, history: args.history, context: args.context });
      this.messagesValue = [...args.baseMessages, { role: 'assistant', content: result.message, timestamp: new Date(), tokensUsed: result.tokensUsed }];
      this.isOnlineValue = true;
      this.lastResponseTokensValue = result.tokensUsed;
    } catch (error) {
      this.handleError(error, args.baseMessages);
    } finally {
      this.isSendingValue = false;
      this.notify();
    }
  }

  private shouldFallback(error: unknown): boolean {
    const code = apiHttpStatus(error);
    return code === 404 || code === 405 || code === 501;
  }

  private handleError(error: unknown, baseMessages: AssistantMessage[]): void {
    debugLogApiIssue(error, { operation: 'AssistantController.sendMessage' });
    const msg = userFacingErrorMessage(error);
    this.messagesValue = [...baseMessages, { role: 'system', content: msg, timestamp: new Date() }];
    this.errorMessageValue = msg;
    this.isOnlineValue = false;
  }

  private appendSystem(text: string): void {
    this.messagesValue = [...this.messagesValue, { role: 'system', content: text, timestamp: new Date() }];
    this.notify();
  }

  clearMessages(): void {
    this.messagesValue = [];
    this.errorMessageValue = undefined;
    this.notify();
  }

  clearError(): void {
    this.errorMessageValue = undefined;
    this.notify();
  }
}

function replaceLast<T>(arr: T[], value: T): T[] {
  const copy = [...arr];
  copy[copy.length - 1] = value;
  return copy;
}
