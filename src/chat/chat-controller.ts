import type { AgUiEvent } from '../protocol/events.js';
import { chatMessageRoleFromRaw, parseContentBlocks, type ChatHilGate, type ChatMessage, type ChatThread } from './chat-models.js';

type Listener = () => void;

/**
 * Why a run ended with an error. `message` is for the person using the app; `code` (when the platform has one for the
 * failure — `llm_billing` for an account out of credit, `llm_auth`, `llm_rate_limited`, `llm_unavailable`, …) lets the app word it.
 */
export interface AgUiRunError {
  message: string;
  code?: string;
}

/** The Team member currently taking its turn — set from `STEP_STARTED`, cleared on `STEP_FINISHED`. */
export interface ActiveChatMember {
  memberEntityId?: string;
  displayName?: string;
}

/**
 * Where a Team member stands in the conversation, from its own `STEP_STARTED`/`STEP_FINISHED`:
 * `working` while it takes its turn, `waiting` if the run paused (a human question) while it was
 * mid-turn, `done` once its turn ended. A member that has not appeared yet has no entry.
 */
export type TeamMemberStatus = 'working' | 'waiting' | 'done' | 'failed';

/**
 * Where a Workflow node stands in the run, from its own `STEP_STARTED`/`STEP_FINISHED`'s
 * `stepName` (the node's id) — same three states as {@link TeamMemberStatus}, kept as its own
 * type since the two are unrelated concepts that happen to share a shape. A node not reached
 * yet has no entry.
 */
export type WorkflowStepStatus = 'working' | 'waiting' | 'done' | 'failed';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Drives chat state from a stream of AG-UI events — port of the Flutter SDK's
 * push-based `ChatController.fromStream`. The pull-based REST provider mode
 * (`IChatProvider`/`loadThreads` against a REST backend) is not yet ported;
 * feed events from {@link useRunStream} (or any AG-UI event source) via
 * {@link ChatController.feedEvent}.
 *
 * A plain event-emitter class (not React-specific) — see {@link useChatController}
 * for the React binding via `useSyncExternalStore`.
 *
 * ## Supported AG-UI events
 *
 * | Event | Effect |
 * |---|---|
 * | `CUSTOM(CHAT_THREAD_CREATED)` | Adds / upserts the thread |
 * | `CUSTOM(CHAT_MESSAGE_RECEIVED)` | Appends a message to its thread |
 * | `CUSTOM(CHAT_HIL_GATE_REACHED \| HIL_GATE_REACHED)` | Sets `pendingHilGate` |
 * | `CUSTOM(CHAT_HIL_RESOLVED \| HIL_RESOLVED)` | Clears `pendingHilGate` |
 * | `TEXT_MESSAGE_START/CONTENT/END` | Streams an assistant message into the active thread |
 * | `RUN_FINISHED` (interrupted, reason `chat_hil_gate`) | Sets `pendingHilGate` from the interrupt |
 * | `STEP_STARTED` / `STEP_FINISHED` (Team member identity present) | Sets/clears `activeMember` |
 */
export class ChatController {
  private readonly contextId: string;
  private readonly listeners = new Set<Listener>();

  private threadsState: ChatThread[] = [];
  private readonly messagesByThread = new Map<string, ChatMessage[]>();
  // message-id -> in-progress streamed text
  private readonly inProgress = new Map<string, string>();
  // message-id -> threadId (routes TEXT_MESSAGE_CONTENT to the right thread)
  private readonly inProgressThreadId = new Map<string, string>();

  private isAwaitingResponseState = false;
  private pendingHilGateState: ChatHilGate | undefined;
  private activeMemberState: ActiveChatMember | undefined;
  private runErrorState: AgUiRunError | undefined;
  // Replaced (never mutated) on every change so it is a stable useSyncExternalStore snapshot.
  private memberStatusesState: ReadonlyMap<string, TeamMemberStatus> = new Map();
  // Same shape as memberStatusesState, keyed by stepName instead of memberEntityId — set
  // unconditionally (a standalone Agent/Workflow's STEP_STARTED never carries member identity,
  // but always carries stepName). Powers WorkflowGraph.
  private stepStatusesState: ReadonlyMap<string, WorkflowStepStatus> = new Map();

  constructor(args: { contextId?: string } = {}) {
    this.contextId = args.contextId ?? '';
  }

  // ── Subscription (for useSyncExternalStore) ──────────────────────────────

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  // ── Snapshot getters ──────────────────────────────────────────────────────

  get threads(): ChatThread[] {
    return this.threadsState;
  }

  get isAwaitingResponse(): boolean {
    return this.isAwaitingResponseState;
  }

  /** Set when a HIL gate is reached; `undefined` once resolved. */
  get pendingHilGate(): ChatHilGate | undefined {
    return this.pendingHilGateState;
  }

  /**
   * The Team member currently taking its turn, or `undefined` when nobody is
   * (a standalone Agent run, or between turns). Powers `ChatActiveMemberIndicator`.
   */
  get activeMember(): ActiveChatMember | undefined {
    return this.activeMemberState;
  }

  /**
   * Why the last run ended with an error, or `undefined` (no error, or it was dismissed / a new run started). Powers the
   * notice `ChatDiscussion` shows — a run that stops on an account out of credit must never just look stuck.
   */
  get runError(): AgUiRunError | undefined {
    return this.runErrorState;
  }

  /** Hides the error notice of the last run. */
  dismissRunError(): void {
    if (!this.runErrorState) return;
    this.runErrorState = undefined;
    this.notify();
  }

  /**
   * Status of every Team member seen so far, keyed by `memberEntityId` — empty for a standalone
   * Agent. Powers `TeamRoster` and `TeamGraph`; a new Map instance on every change.
   */
  get memberStatuses(): ReadonlyMap<string, TeamMemberStatus> {
    return this.memberStatusesState;
  }

  /**
   * Status of every Workflow node reached so far, keyed by `stepName` (its node id) — empty for
   * a Team/Agent run. Powers `WorkflowGraph`; a new Map instance on every change.
   */
  get stepStatuses(): ReadonlyMap<string, WorkflowStepStatus> {
    return this.stepStatusesState;
  }

  private setMemberStatus(memberEntityId: string, status: TeamMemberStatus): void {
    const next = new Map(this.memberStatusesState);
    next.set(memberEntityId, status);
    this.memberStatusesState = next;
  }

  private setStepStatus(stepName: string, status: WorkflowStepStatus): void {
    const next = new Map(this.stepStatusesState);
    next.set(stepName, status);
    this.stepStatusesState = next;
  }

  // A run that ends mid-turn leaves its member 'working' with nothing to show for it: paused on a human
  // question it is 'waiting', otherwise (finished, errored) its turn is over.
  private settleWorkingMembers(interrupted: boolean): void {
    let next: Map<string, TeamMemberStatus> | undefined;
    for (const [id, status] of this.memberStatusesState) {
      if (status !== 'working') continue;
      next ??= new Map(this.memberStatusesState);
      next.set(id, interrupted ? 'waiting' : 'done');
    }
    if (next) this.memberStatusesState = next;
  }

  /** Same idea as {@link settleWorkingMembers}, for {@link stepStatusesState}. */
  private settleWorkingSteps(interrupted: boolean): void {
    let next: Map<string, WorkflowStepStatus> | undefined;
    for (const [id, status] of this.stepStatusesState) {
      if (status !== 'working') continue;
      next ??= new Map(this.stepStatusesState);
      next.set(id, interrupted ? 'waiting' : 'done');
    }
    if (next) this.stepStatusesState = next;
  }

  /** Returns locally-cached messages for `threadId` (stable reference until it changes). */
  messagesFor(threadId: string): ChatMessage[] {
    return this.messagesByThread.get(threadId) ?? EMPTY_MESSAGES;
  }

  // ── Mutators ──────────────────────────────────────────────────────────────

  /** Injects an AG-UI event into the controller. Call this from your SSE subscription. */
  feedEvent = (event: AgUiEvent): void => {
    this.onAgUiEvent(event);
  };

  /** Directly registers `thread` without a network call. */
  addThread(thread: ChatThread): void {
    const idx = this.threadsState.findIndex((t) => t.threadId === thread.threadId);
    if (idx >= 0) {
      const updated = [...this.threadsState];
      updated[idx] = thread;
      this.threadsState = updated;
    } else {
      this.threadsState = [...this.threadsState, thread];
    }
    this.notify();
  }

  /** Appends (or replaces, by id) `message` in `threadId`'s local message list. */
  addMessage(threadId: string, message: ChatMessage): void {
    // A message restored from history (the conversations API) carries its widgets only as the raw `blocks` of its metadata: read
    // them back, or the conversation reopens with empty bubbles where the cards and charts were.
    if (!message.blocks) {
      const restored = parseContentBlocks(message.metadata?.['blocks']);
      if (restored) message = { ...message, blocks: restored };
    }
    const existing = [...(this.messagesByThread.get(threadId) ?? [])];
    const idx = existing.findIndex((m) => m.id === message.id);
    if (idx >= 0) {
      existing[idx] = message;
    } else {
      existing.push(message);
    }
    this.messagesByThread.set(threadId, existing);
    this.notify();
  }

  /** Directly sets the pending HIL gate (e.g. from an out-of-band signal). */
  setHilGate(gate: ChatHilGate): void {
    this.pendingHilGateState = gate;
    this.notify();
  }

  /** Clears `pendingHilGate`. */
  clearHilGate(): void {
    if (!this.pendingHilGateState) return;
    this.pendingHilGateState = undefined;
    this.notify();
  }

  /** Resets all conversation state — threads, messages, HIL gate. Use when starting a new execution. */
  clear(): void {
    this.threadsState = [];
    this.messagesByThread.clear();
    this.pendingHilGateState = undefined;
    this.isAwaitingResponseState = false;
    this.activeMemberState = undefined;
    this.runErrorState = undefined;
    this.memberStatusesState = new Map();
    this.stepStatusesState = new Map();
    this.inProgress.clear();
    this.inProgressThreadId.clear();
    this.notify();
  }

  // ── AG-UI event reduction ────────────────────────────────────────────────

  private onAgUiEvent(event: AgUiEvent): void {
    switch (event.type) {
      // Run lifecycle → drive isAwaitingResponse
      case 'RUN_STARTED':
        this.isAwaitingResponseState = true;
        this.runErrorState = undefined;
        this.notify();
        break;

      case 'RUN_FINISHED': {
        this.isAwaitingResponseState = false;
        this.activeMemberState = undefined;
        this.settleWorkingMembers(event.outcome?.kind === 'interrupt');
        this.settleWorkingSteps(event.outcome?.kind === 'interrupt');
        if (event.outcome?.kind === 'interrupt') {
          for (const interrupt of event.outcome.interrupts) {
            if (interrupt.reason === 'chat_hil_gate' || interrupt.reason.startsWith('chat')) {
              const meta = interrupt.metadata ?? {};
              this.pendingHilGateState = {
                requestId: interrupt.id,
                threadId: String(meta['threadId'] ?? '').trim(),
                question: interrupt.message ?? interrupt.reason,
                title: String(meta['title'] ?? 'Input required').trim(),
              };
              break;
            }
          }
        }
        this.notify();
        break;
      }

      case 'RUN_ERROR':
        this.isAwaitingResponseState = false;
        this.activeMemberState = undefined;
        this.runErrorState = { message: event.message, code: event.code };
        this.settleWorkingMembers(false);
        this.settleWorkingSteps(false);
        this.notify();
        break;

      case 'CUSTOM':
        this.handleCustomEvent(event.name, event.value);
        break;

      // Turn boundaries → drive activeMember (Team runs only — needs member identity) and
      // stepStatuses (any run — stepName is always present, so this fires for a Workflow's
      // node-by-node progress too, not just a Team's member turns).
      case 'STEP_STARTED':
        if (event.stepName) this.setStepStatus(event.stepName, 'working');
        if (event.memberEntityId || event.displayName) {
          this.activeMemberState = { memberEntityId: event.memberEntityId, displayName: event.displayName };
          if (event.memberEntityId) this.setMemberStatus(event.memberEntityId, 'working');
        }
        if (event.stepName || this.activeMemberState) this.notify();
        break;

      case 'STEP_FINISHED': {
        // A step that ended because it failed says so (`error`): its member is shown as failed, not as done.
        const outcome = event.error ? 'failed' : 'done';
        if (event.stepName) this.setStepStatus(event.stepName, outcome);
        const hadActiveMember = this.activeMemberState || event.memberEntityId;
        if (hadActiveMember) {
          this.activeMemberState = undefined;
          if (event.memberEntityId) this.setMemberStatus(event.memberEntityId, outcome);
        }
        if (event.stepName || hadActiveMember) this.notify();
        break;
      }

      // Streaming text messages → accumulate into the active thread
      case 'TEXT_MESSAGE_START': {
        const threadId = this.pendingHilGateState?.threadId ?? this.lastThreadId();
        if (threadId) {
          this.inProgress.set(event.messageId, '');
          this.inProgressThreadId.set(event.messageId, threadId);
        }
        break;
      }

      case 'TEXT_MESSAGE_CONTENT': {
        const current = this.inProgress.get(event.messageId);
        if (current !== undefined) {
          this.inProgress.set(event.messageId, current + event.delta);
          this.notify();
        }
        break;
      }

      case 'TEXT_MESSAGE_CHUNK': {
        if (event.messageId && event.delta) {
          const current = this.inProgress.get(event.messageId) ?? '';
          this.inProgress.set(event.messageId, current + event.delta);
          this.notify();
        }
        break;
      }

      case 'TEXT_MESSAGE_END': {
        const text = this.inProgress.get(event.messageId);
        const threadId = this.inProgressThreadId.get(event.messageId);
        this.inProgress.delete(event.messageId);
        this.inProgressThreadId.delete(event.messageId);
        if (text && threadId) {
          this.addMessage(threadId, {
            id: event.messageId,
            role: 'assistant',
            contextId: this.contextId,
            threadId,
            runId: '',
            text,
            createdAt: new Date(),
          });
        }
        break;
      }

      default:
        break;
    }
  }

  private handleCustomEvent(name: string, value: unknown): void {
    const data = asRecord(value);

    switch (name) {
      case 'CHAT_THREAD_CREATED': {
        const threadId = String(data['threadId'] ?? '').trim();
        if (!threadId) return;
        this.addThread({
          threadId,
          contextId: this.contextId,
          runId: String(data['runId'] ?? '').trim(),
          title: String(data['title'] ?? '').trim(),
          isDefault: data['isDefault'] === true,
          status: String(data['status'] ?? 'active').trim(),
        });
        return;
      }

      case 'CHAT_MESSAGE_RECEIVED': {
        const threadId = String(data['threadId'] ?? '').trim();
        const messageId = String(data['messageId'] ?? '').trim();
        if (!threadId || !messageId) return;
        // Auto-create the thread if a CHAT_THREAD_CREATED was never received.
        if (!this.threadsState.some((t) => t.threadId === threadId)) {
          this.addThread({ threadId, contextId: this.contextId, runId: String(data['runId'] ?? '').trim(), title: '', isDefault: true, status: 'active' });
        }
        const authorId = typeof data['memberEntityId'] === 'string' ? data['memberEntityId'] : undefined;
        const authorName = typeof data['displayName'] === 'string' ? data['displayName'] : undefined;
        this.addMessage(threadId, {
          id: messageId,
          role: chatMessageRoleFromRaw(String(data['role'] ?? 'assistant')),
          contextId: this.contextId,
          threadId,
          runId: String(data['runId'] ?? '').trim(),
          text: String(data['text'] ?? '').trim(),
          blocks: parseContentBlocks(data['blocks']),
          authorId,
          authorName,
          metadata: typeof data['source'] === 'string' ? { 'interaction.source': data['source'] } : undefined,
          createdAt: new Date(),
        });
        return;
      }

      // Also tolerate the legacy name used by some backends, but only when the
      // channelType is chat or unspecified (forms HIL uses the "forms" channel).
      case 'CHAT_HIL_GATE_REACHED':
      case 'HIL_GATE_REACHED': {
        const requestId = String(data['requestId'] ?? '').trim();
        const threadId = String(data['threadId'] ?? '').trim();
        const channelType = String(data['channelType'] ?? '').trim().toLowerCase();
        if (!requestId) return;
        // Skip HIL gates for non-chat channels (e.g. "forms") — they are handled by their own UI.
        if (channelType && channelType !== 'chat') return;
        // The widget itself (if any) already arrived as its own CUSTOM event and is rendered
        // via the widget registry (see the default branch below) — this gate only records
        // which request/thread a widget's submit (or a plain-text reply) should resume.
        this.pendingHilGateState = {
          requestId,
          threadId,
          question: String(data['question'] ?? data['message'] ?? '').trim(),
          title: String(data['title'] ?? 'Input required').trim(),
        };
        this.isAwaitingResponseState = false;
        this.notify();
        return;
      }

      case 'CHAT_HIL_RESOLVED':
      case 'HIL_RESOLVED':
        this.clearHilGate();
        return;

      default:
        // Any CUSTOM event that is not a CHAT_*/HIL_* control event is treated as a
        // widget invocation from the agent. Store it as a ChatMessage so the caller
        // can render it via its own widget registry.
        if (!name.startsWith('CHAT_') && !name.startsWith('HIL_')) {
          const threadId = this.pendingHilGateState?.threadId ?? this.lastThreadId();
          if (threadId) {
            this.addMessage(threadId, {
              id: `${name}_${Date.now()}`,
              role: 'assistant',
              contextId: this.contextId,
              threadId,
              runId: '',
              text: '',
              metadata: { widgetType: name, widgetProps: data },
              createdAt: new Date(),
            });
          }
        }
    }
  }

  private lastThreadId(): string | undefined {
    return this.threadsState.length > 0 ? this.threadsState[this.threadsState.length - 1]!.threadId : undefined;
  }
}

const EMPTY_MESSAGES: ChatMessage[] = [];
