import type { AgUiEvent, AgUiInterrupt } from '../../protocol/events.js';
import type { AgentivityPlatformConnector, AgUiSendMessageOptions, AgUiStartRunOptions } from '../connectors/agentivity-platform-connector.js';

// ── Status ────────────────────────────────────────────────────────────────────

/** Lifecycle status of an {@link AgUiPlatformRunController}. */
export type AgUiPlatformRunStatus = 'idle' | 'running' | 'waitingForInput' | 'completed' | 'failed';

// ── Message ───────────────────────────────────────────────────────────────────

/**
 * A fully-assembled text message produced by an agent run. Built from the
 * `TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT → TEXT_MESSAGE_END` event
 * sequence streamed by the backend.
 */
export interface AgUiRunMessage {
  messageId: string;
  /** `"assistant"` | `"user"` | `"system"` | `"tool"` */
  role: string;
  text: string;
  createdAt: Date;
}

// ── Controller ────────────────────────────────────────────────────────────────

type Listener = () => void;

/**
 * Manages the full lifecycle of an Agentivity platform run, including HIL
 * interrupt handling — port of `AgUiPlatformRunController`. The React
 * equivalent of the `useAgentivityRun` hook described in the EPIC-0449
 * frontend spec.
 *
 * ```ts
 * const connector = new AgentivityPlatformConnector({ baseUrl: '...', authToken: '...' });
 * const controller = new AgUiPlatformRunController({ connector });
 * await controller.start('my-workflow-id', 'Analyse this document', { enableHil: true });
 * ```
 */
export class AgUiPlatformRunController {
  private readonly connector: AgentivityPlatformConnector;
  private readonly listeners = new Set<Listener>();

  private statusValue: AgUiPlatformRunStatus = 'idle';
  private readonly messagesValue: AgUiRunMessage[] = [];
  private interruptValue: AgUiInterrupt | undefined;
  private errorValue: string | undefined;
  private runIdValue: string | undefined;
  private unsubscribeStream: (() => void) | undefined;

  // In-progress streaming message buffer
  private inProgressMessageId: string | undefined;
  private inProgressRole = 'assistant';
  private inProgressBuffer = '';

  constructor(args: { connector: AgentivityPlatformConnector }) {
    this.connector = args.connector;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  get status(): AgUiPlatformRunStatus {
    return this.statusValue;
  }
  get messages(): AgUiRunMessage[] {
    return this.messagesValue;
  }
  /** The active HIL interrupt, present when `status` is `'waitingForInput'`. */
  get interrupt(): AgUiInterrupt | undefined {
    return this.interruptValue;
  }
  /** Error message when `status` is `'failed'`. */
  get error(): string | undefined {
    return this.errorValue;
  }
  /** The current run ID, set after `start` completes successfully. */
  get runId(): string | undefined {
    return this.runIdValue;
  }

  // ── Actions ────────────────────────────────────────────────────────────

  /**
   * Starts a new run for `entityId` with `input`. Any previously running run
   * is cancelled first (`reset` is called). `status` transitions to
   * `'running'` immediately, then the controller subscribes to the SSE event
   * stream.
   */
  async start(entityId: string, input: string, options?: AgUiStartRunOptions): Promise<void> {
    this.reset();
    this.statusValue = 'running';
    this.notify();

    try {
      const handle = await this.connector.startRun(entityId, input, options);
      this.runIdValue = handle.runId;
      this.notify();

      this.unsubscribeStream = this.connector.openRunStream(handle.runId, { streamUrl: handle.streamUrl }, this.handleEvent);
    } catch (error) {
      this.statusValue = 'failed';
      this.errorValue = String(error);
      this.notify();
    }
  }

  /**
   * Resumes the current run after a HIL interrupt. `responseText` is sent to
   * the backend as the user's response. `interrupt` is cleared and `status`
   * is set back to `'running'` in anticipation of the `RUN_STARTED` event.
   * No-op if there is no active interrupt or no run ID.
   */
  async resume(responseText: string): Promise<void> {
    const runId = this.runIdValue;
    const activeInterrupt = this.interruptValue;
    if (runId == null || activeInterrupt == null) return;

    this.interruptValue = undefined;
    this.statusValue = 'running';
    this.notify();

    try {
      await this.connector.resumeRun(runId, { interruptId: activeInterrupt.id, responseText });
    } catch (error) {
      this.statusValue = 'failed';
      this.errorValue = String(error);
      this.notify();
    }
  }

  /** Sends a free-text `message` into the current run. No-op if there is no active run ID. */
  async send(message: string, options?: AgUiSendMessageOptions): Promise<void> {
    const runId = this.runIdValue;
    if (runId == null) return;
    await this.connector.sendMessage(runId, message, options);
  }

  /** Cancels the active run stream and resets all state back to `'idle'`. */
  reset(): void {
    this.unsubscribeStream?.();
    this.unsubscribeStream = undefined;
    this.statusValue = 'idle';
    this.messagesValue.length = 0;
    this.interruptValue = undefined;
    this.errorValue = undefined;
    this.runIdValue = undefined;
    this.clearInProgress();
    this.notify();
  }

  dispose(): void {
    this.unsubscribeStream?.();
    this.unsubscribeStream = undefined;
    this.listeners.clear();
  }

  // ── Event handling ───────────────────────────────────────────────────────

  private handleEvent = (event: AgUiEvent): void => {
    switch (event.type) {
      case 'RUN_STARTED':
        // Run (re)started — could be the initial start or a resume.
        this.statusValue = 'running';
        this.notify();
        break;

      case 'TEXT_MESSAGE_START':
        this.inProgressMessageId = event.messageId;
        this.inProgressRole = event.role;
        this.inProgressBuffer = '';
        break;

      case 'TEXT_MESSAGE_CONTENT':
        if (event.messageId === this.inProgressMessageId) this.inProgressBuffer += event.delta;
        break;

      case 'TEXT_MESSAGE_END':
        if (event.messageId === this.inProgressMessageId && this.inProgressBuffer.length > 0) {
          this.messagesValue.push({ messageId: event.messageId, role: this.inProgressRole, text: this.inProgressBuffer, createdAt: new Date() });
          this.clearInProgress();
          this.notify();
        }
        break;

      case 'RUN_FINISHED':
        if (event.outcome?.kind === 'interrupt' && event.outcome.interrupts.length > 0) {
          this.interruptValue = event.outcome.interrupts[0];
          this.statusValue = 'waitingForInput';
          // Stream stays open — the backend emits RUN_STARTED after resume.
        } else {
          this.statusValue = 'completed';
        }
        this.notify();
        break;

      case 'RUN_ERROR':
        this.statusValue = 'failed';
        this.errorValue = event.message;
        this.notify();
        break;

      default:
        // All other event types (STEP_STARTED, TOOL_CALL_*, STATE_SNAPSHOT, etc.)
        // are intentionally ignored by this controller. Wire additional
        // controllers (e.g. AgUiActivityController, AgUiStateController) to
        // the same stream for richer observability.
        break;
    }
  };

  private clearInProgress(): void {
    this.inProgressMessageId = undefined;
    this.inProgressBuffer = '';
    this.inProgressRole = 'assistant';
  }
}
