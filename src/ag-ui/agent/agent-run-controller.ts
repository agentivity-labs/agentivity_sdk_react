import { debugLogApiIssue, userFacingErrorMessage } from '../../client/api-contract.js';
import { isTerminalAgentRunState, isTerminalAgentRunStreamEvent, type AgentRunStatus, type AgentRunStreamEvent } from './agent-run-models.js';
import type { IAgentRunProvider } from './i-agent-run-provider.js';

type Listener = () => void;

/**
 * REST-polling agent run controller — port of `AgentRunController`.
 *
 * Manages a complete run lifecycle against an {@link IAgentRunProvider} that
 * exposes discrete HTTP endpoints (start, stream domain events, fetch result,
 * cancel).
 *
 * **Typical flow:**
 * 1. Call `startRun` → triggers `startRun` on the provider, opens the event stream.
 * 2. Domain `AgentRunStreamEvent`s arrive via `events` as the run executes.
 * 3. On a terminal event, `fetchRun` is called automatically to populate `result`.
 * 4. Call `cancelRun` to abort a running job.
 *
 * **When to use this vs the AG-UI-native path**: use {@link AgentRunController}
 * when your backend exposes a "run" resource with its own REST contract (list
 * runs, start, poll status, cancel). Use `useRunStream` + `ChatController`
 * directly when you consume a raw AG-UI event SSE stream — the AG-UI-native
 * streaming approach used by the Agentivity platform client.
 */
export class AgentRunController {
  private readonly provider: IAgentRunProvider;
  private readonly agentId: string;
  private readonly listeners = new Set<Listener>();

  private runIdValue: string | undefined;
  private isStartingValue = false;
  private isConnectedValue = false;
  private isCancellingValue = false;
  private eventsValue: AgentRunStreamEvent[] = [];
  private resultValue: AgentRunStatus | undefined;
  private errorMessageValue: string | undefined;
  private unsubscribeStream: (() => void) | undefined;

  constructor(args: { provider: IAgentRunProvider; agentId: string }) {
    this.provider = args.provider;
    this.agentId = args.agentId;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  get runId(): string | undefined {
    return this.runIdValue;
  }
  get isStarting(): boolean {
    return this.isStartingValue;
  }
  get isConnected(): boolean {
    return this.isConnectedValue;
  }
  get isCancelling(): boolean {
    return this.isCancellingValue;
  }
  get events(): AgentRunStreamEvent[] {
    return this.eventsValue;
  }
  get result(): AgentRunStatus | undefined {
    return this.resultValue;
  }
  get errorMessage(): string | undefined {
    return this.errorMessageValue;
  }

  get isActive(): boolean {
    return this.runIdValue != null && (this.isStartingValue || this.isConnectedValue) && (this.resultValue == null || !isTerminalAgentRunState(this.resultValue.state));
  }

  async startRun(args: { input: string }): Promise<void> {
    if (this.isActive) return;
    this.isStartingValue = true;
    this.eventsValue = [];
    this.resultValue = undefined;
    this.errorMessageValue = undefined;
    this.notify();

    try {
      const started = await this.provider.startRun({ agentId: this.agentId, input: args.input });
      this.runIdValue = started.runId;
      this.isStartingValue = false;
      this.notify();
      this.openStream(started.runId);
    } catch (error) {
      debugLogApiIssue(error, { operation: 'AgentRunController.startRun' });
      this.isStartingValue = false;
      this.errorMessageValue = userFacingErrorMessage(error);
      this.notify();
    }
  }

  private openStream(runId: string): void {
    this.closeStream();
    this.isConnectedValue = true;
    this.notify();

    this.unsubscribeStream = this.provider.streamRun({ runId }, (event) => {
      this.eventsValue = [...this.eventsValue, event];
      this.notify();
      if (isTerminalAgentRunStreamEvent(event)) void this.fetchResult(runId);
    });
  }

  private async fetchResult(runId: string): Promise<void> {
    try {
      this.resultValue = await this.provider.fetchRun({ agentId: this.agentId, runId });
      this.isConnectedValue = false;
      this.closeStream();
    } catch (error) {
      debugLogApiIssue(error, { operation: 'AgentRunController._fetchResult' });
    } finally {
      this.notify();
    }
  }

  async cancelRun(): Promise<void> {
    const runId = this.runIdValue;
    if (runId == null || this.isCancellingValue) return;
    this.isCancellingValue = true;
    this.errorMessageValue = undefined;
    this.notify();
    try {
      await this.provider.cancelRun({ agentId: this.agentId, runId });
      this.closeStream();
    } catch (error) {
      debugLogApiIssue(error, { operation: 'AgentRunController.cancelRun' });
      this.errorMessageValue = userFacingErrorMessage(error);
    } finally {
      this.isCancellingValue = false;
      this.notify();
    }
  }

  reset(): void {
    this.closeStream();
    this.runIdValue = undefined;
    this.isStartingValue = false;
    this.isConnectedValue = false;
    this.isCancellingValue = false;
    this.eventsValue = [];
    this.resultValue = undefined;
    this.errorMessageValue = undefined;
    this.notify();
  }

  private closeStream(): void {
    this.unsubscribeStream?.();
    this.unsubscribeStream = undefined;
    this.isConnectedValue = false;
  }

  dispose(): void {
    this.closeStream();
    this.listeners.clear();
  }
}
