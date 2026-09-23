import type { AgUiEvent } from '../../protocol/events.js';
import type { AgUiFrontendToolRegistry } from '../tools/frontend-tool.js';
import type { AgUiWidgetRegistry } from '../../artifacts/widget-registry.js';

// ── Item model ────────────────────────────────────────────────────────────────

/** A streamed or completed text message. */
export interface AgUiTextItem {
  kind: 'text';
  messageId: string;
  role: string;
  text: string;
  /** `true` while the message is still being streamed. */
  isStreaming: boolean;
}

/** A reasoning/chain-of-thought block. */
export interface AgUiReasoningItem {
  kind: 'reasoning';
  messageId: string;
  text: string;
  isStreaming: boolean;
}

/** A dynamically rendered component resolved from an {@link AgUiWidgetRegistry}. */
export interface AgUiComponentItem {
  kind: 'component';
  component: string;
  props: Record<string, unknown>;
}

/**
 * Agent-generated HTML for open-ended generative UI. Triggered by a `CUSTOM`
 * event with `name === "html"` or `"ag-ui:html"`.
 */
export interface AgUiHtmlItem {
  kind: 'html';
  html: string;
  /** Suggested render height in pixels, or `undefined` for unconstrained. */
  height?: number;
}

export type AgUiToolCallStatus = 'pending' | 'running' | 'completed' | 'failed';

/** A tool call in progress or completed. */
export interface AgUiToolCallItem {
  kind: 'toolCall';
  toolCallId: string;
  toolCallName: string;
  status: AgUiToolCallStatus;
  /** The tool result. String for backend tools; arbitrary for frontend tools. */
  result?: unknown;
  error?: string;
}

export type AgUiGenerativeItem = AgUiTextItem | AgUiReasoningItem | AgUiComponentItem | AgUiHtmlItem | AgUiToolCallItem;

/** Pending HIL gate — an interaction the user must respond to before the run continues. */
export interface AgUiHilGate {
  requestId: string;
  threadId: string;
  question: string;
  title: string;
  questionsToAsk: string[];
}

// ── Controller ────────────────────────────────────────────────────────────────

type Listener = () => void;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

interface PendingTool {
  toolCallId: string;
  toolCallName: string;
  argsBuffer: string;
}

/**
 * Processes a stream of AG-UI events and maintains a live list of
 * {@link AgUiGenerativeItem}s for rendering — port of `AgUiGenerativeController`.
 *
 * Generative UI works in two complementary ways:
 * - **Via tool calls**: the agent calls a tool whose name matches a component
 *   in `widgetRegistry`. The controller replaces the tool-call placeholder
 *   with the rendered component.
 * - **Via CUSTOM events**: the agent emits
 *   `{"type":"CUSTOM","name":"render","value":{"component":"MyCard","props":{...}}}`.
 *
 * Frontend tools (in `toolRegistry`) are executed locally on the client;
 * their results are shown inline without a round-trip to the backend.
 */
export class AgUiGenerativeController {
  readonly toolRegistry?: AgUiFrontendToolRegistry;
  readonly widgetRegistry?: AgUiWidgetRegistry;

  private itemsValue: AgUiGenerativeItem[] = [];
  private readonly pendingTexts = new Map<string, { role: string; buffer: string }>();
  private readonly pendingReasoning = new Map<string, { buffer: string }>();
  private readonly pendingTools = new Map<string, PendingTool>();
  private readonly listeners = new Set<Listener>();

  private isRunningValue = false;
  private hilGateValue: AgUiHilGate | undefined;

  constructor(args: { toolRegistry?: AgUiFrontendToolRegistry; widgetRegistry?: AgUiWidgetRegistry; initialItems?: AgUiGenerativeItem[] } = {}) {
    this.toolRegistry = args.toolRegistry;
    this.widgetRegistry = args.widgetRegistry;
    if (args.initialItems && args.initialItems.length > 0) this.itemsValue = [...args.initialItems];
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  get items(): AgUiGenerativeItem[] {
    return this.itemsValue;
  }

  /** True while the run is processing (between `RUN_STARTED` and a terminal event). */
  get isRunning(): boolean {
    return this.isRunningValue;
  }

  /** Set when the run is waiting for a human response (HIL gate). */
  get pendingHilGate(): AgUiHilGate | undefined {
    return this.hilGateValue;
  }

  /**
   * Prepends historical items (e.g. loaded from a thread store) before live
   * events. Call before the event stream delivers any events, or to restore
   * after a reconnect.
   */
  seedItems(historicalItems: AgUiGenerativeItem[]): void {
    if (historicalItems.length === 0) return;
    this.itemsValue = [...historicalItems, ...this.itemsValue];
    this.notify();
  }

  /** Clears the pending HIL gate (e.g. after the user submitted a response). */
  clearHilGate(): void {
    if (!this.hilGateValue) return;
    this.hilGateValue = undefined;
    this.notify();
  }

  /** Manually injects an event — use when you manage your own event source. */
  feedEvent = (event: AgUiEvent): void => {
    this.onEvent(event);
  };

  /** Removes all items and cancels pending state. Does not affect any event source. */
  clear(): void {
    this.itemsValue = [];
    this.pendingTexts.clear();
    this.pendingReasoning.clear();
    this.pendingTools.clear();
    this.notify();
  }

  // ── Event dispatch ────────────────────────────────────────────────────────

  private onEvent(event: AgUiEvent): void {
    switch (event.type) {
      case 'RUN_STARTED':
        this.isRunningValue = true;
        this.notify();
        break;

      case 'RUN_FINISHED': {
        this.isRunningValue = false;
        if (event.outcome?.kind === 'interrupt') {
          for (const interrupt of event.outcome.interrupts) {
            if (interrupt.reason.startsWith('chat')) {
              const meta = interrupt.metadata ?? {};
              this.hilGateValue = {
                requestId: interrupt.id,
                threadId: String(meta['threadId'] ?? '').trim(),
                question: interrupt.message ?? interrupt.reason,
                title: String(meta['title'] ?? 'Input required').trim(),
                questionsToAsk: [],
              };
              break;
            }
          }
        }
        this.notify();
        break;
      }

      case 'RUN_ERROR':
        this.isRunningValue = false;
        this.notify();
        break;

      case 'CUSTOM':
        this.onCustomEvent(event.name, event.value);
        break;

      case 'TEXT_MESSAGE_START':
        this.pendingTexts.set(event.messageId, { role: event.role, buffer: '' });
        this.itemsValue = [...this.itemsValue, { kind: 'text', messageId: event.messageId, role: event.role, text: '', isStreaming: true }];
        this.notify();
        break;

      case 'TEXT_MESSAGE_CONTENT': {
        const pending = this.pendingTexts.get(event.messageId);
        if (pending) pending.buffer += event.delta;
        this.patchText(event.messageId);
        this.notify();
        break;
      }

      case 'TEXT_MESSAGE_END':
        this.pendingTexts.delete(event.messageId);
        this.patchText(event.messageId, false);
        this.notify();
        break;

      case 'TEXT_MESSAGE_CHUNK': {
        const { messageId: id, delta, role } = event;
        if (id && delta) {
          if (!this.pendingTexts.has(id)) {
            this.pendingTexts.set(id, { role: role ?? 'assistant', buffer: '' });
            this.itemsValue = [...this.itemsValue, { kind: 'text', messageId: id, role: role ?? 'assistant', text: '', isStreaming: true }];
          }
          this.pendingTexts.get(id)!.buffer += delta;
          this.patchText(id);
          this.notify();
        }
        break;
      }

      case 'THINKING_TEXT_MESSAGE_START':
        this.pendingReasoning.set(event.messageId, { buffer: '' });
        this.itemsValue = [...this.itemsValue, { kind: 'reasoning', messageId: event.messageId, text: '', isStreaming: true }];
        this.notify();
        break;

      case 'THINKING_TEXT_MESSAGE_CONTENT': {
        const pending = this.pendingReasoning.get(event.messageId);
        if (pending) pending.buffer += event.delta;
        this.patchReasoning(event.messageId);
        this.notify();
        break;
      }

      case 'THINKING_TEXT_MESSAGE_END':
        this.pendingReasoning.delete(event.messageId);
        this.patchReasoning(event.messageId, false);
        this.notify();
        break;

      case 'THINKING_TEXT_MESSAGE_CHUNK': {
        const { messageId: id, delta } = event;
        if (id && delta) {
          if (!this.pendingReasoning.has(id)) {
            this.pendingReasoning.set(id, { buffer: '' });
            this.itemsValue = [...this.itemsValue, { kind: 'reasoning', messageId: id, text: '', isStreaming: true }];
          }
          this.pendingReasoning.get(id)!.buffer += delta;
          this.patchReasoning(id);
          this.notify();
        }
        break;
      }

      case 'TOOL_CALL_START':
        this.pendingTools.set(event.toolCallId, { toolCallId: event.toolCallId, toolCallName: event.toolCallName, argsBuffer: '' });
        this.itemsValue = [...this.itemsValue, { kind: 'toolCall', toolCallId: event.toolCallId, toolCallName: event.toolCallName, status: 'pending' }];
        this.notify();
        break;

      case 'TOOL_CALL_ARGS': {
        const pending = this.pendingTools.get(event.toolCallId);
        if (pending) pending.argsBuffer += event.delta;
        break;
      }

      case 'TOOL_CALL_CHUNK': {
        const id = event.toolCallId;
        if (id) {
          if (!this.pendingTools.has(id) && event.toolCallName) {
            this.pendingTools.set(id, { toolCallId: id, toolCallName: event.toolCallName, argsBuffer: '' });
            this.itemsValue = [...this.itemsValue, { kind: 'toolCall', toolCallId: id, toolCallName: event.toolCallName, status: 'pending' }];
            this.notify();
          }
          if (event.delta && this.pendingTools.has(id)) {
            this.pendingTools.get(id)!.argsBuffer += event.delta;
          }
        }
        break;
      }

      case 'TOOL_CALL_END':
        this.completeTool(event.toolCallId);
        break;

      case 'TOOL_CALL_RESULT':
        this.applyBackendResult(event.toolCallId, event.content);
        break;

      default:
        break;
    }
  }

  private onCustomEvent(name: string, value: unknown): void {
    const data = asRecord(value);

    switch (name) {
      case 'render':
      case 'ag-ui:render':
        this.applyRenderEvent(value);
        return;

      case 'html':
      case 'ag-ui:html':
        this.applyHtmlEvent(value);
        return;

      case 'CHAT_MESSAGE_RECEIVED': {
        const msgId = String(data['messageId'] ?? '').trim();
        const text = String(data['text'] ?? '').trim();
        const role = String(data['role'] ?? 'assistant').trim();
        if (msgId) {
          this.itemsValue = [...this.itemsValue, { kind: 'text', messageId: msgId, role, text, isStreaming: false }];
          this.notify();
        }
        return;
      }

      case 'CHAT_HIL_GATE_REACHED':
      case 'HIL_GATE_REACHED': {
        const requestId = String(data['requestId'] ?? '').trim();
        const threadId = String(data['threadId'] ?? '').trim();
        const channelType = String(data['channelType'] ?? '').trim().toLowerCase();
        if (!requestId) return;
        if (channelType && channelType !== 'chat') return;

        const rawQ = data['questionsToAsk'];
        const questions = Array.isArray(rawQ) ? rawQ.filter((s): s is string => typeof s === 'string' && s.trim().length > 0) : [];
        const hilSource = String(data['hilSource'] ?? 'ask_human').trim();

        this.hilGateValue = {
          requestId,
          threadId,
          question: String(data['question'] ?? data['message'] ?? '').trim(),
          title: String(data['title'] ?? 'Input required').trim(),
          questionsToAsk: questions,
        };
        this.isRunningValue = false;

        // Only inject a QuestionForm widget for explicit ask_human calls.
        // For qualification-path HIL the question is already in the preceding text.
        if (hilSource !== 'qualification' && questions.length > 0 && threadId) {
          this.itemsValue = [
            ...this.itemsValue,
            { kind: 'component', component: 'QuestionForm', props: { title: this.hilGateValue.title, questions: questions.map((q, i) => ({ id: `q${i}`, label: q })) } },
          ];
        }
        this.notify();
        return;
      }

      case 'CHAT_HIL_RESOLVED':
      case 'HIL_RESOLVED':
        this.hilGateValue = undefined;
        this.notify();
    }
  }

  // ── Tool completion ─────────────────────────────────────────────────────

  private completeTool(toolCallId: string): void {
    const pending = this.pendingTools.get(toolCallId);
    this.pendingTools.delete(toolCallId);
    if (!pending) return;

    const args = parseArgs(pending.argsBuffer);

    if (this.widgetRegistry?.[pending.toolCallName]) {
      this.replaceItem(toolCallId, { kind: 'component', component: pending.toolCallName, props: args });
      this.notify();
      return;
    }

    if (this.toolRegistry?.has(pending.toolCallName)) {
      this.patchToolItem(toolCallId, { status: 'running' });
      this.notify();
      this.toolRegistry
        .execute(pending.toolCallName, args)
        .then((result) => {
          this.patchToolItem(toolCallId, { status: 'completed', result });
          this.notify();
        })
        .catch((error: unknown) => {
          this.patchToolItem(toolCallId, { status: 'failed', error: String(error) });
          this.notify();
        });
      return;
    }

    this.patchToolItem(toolCallId, { status: 'running' });
    this.notify();
  }

  private applyBackendResult(toolCallId: string, content: string): void {
    this.patchToolItem(toolCallId, { status: 'completed', result: content });
    this.notify();
  }

  private applyRenderEvent(value: unknown): void {
    const map = asRecord(value);
    const component = typeof map['component'] === 'string' ? map['component'] : undefined;
    if (!component) return;
    const props = asRecord(map['props']);
    this.itemsValue = [...this.itemsValue, { kind: 'component', component, props }];
    this.notify();
  }

  private applyHtmlEvent(value: unknown): void {
    const map = typeof value === 'object' && value ? (value as Record<string, unknown>) : undefined;
    const html = map ? (map['html'] != null ? String(map['html']) : undefined) : value != null ? String(value) : undefined;
    if (!html) return;
    const height = map && typeof map['height'] === 'number' ? map['height'] : undefined;
    this.itemsValue = [...this.itemsValue, { kind: 'html', html, height }];
    this.notify();
  }

  // ── Item patching helpers ────────────────────────────────────────────────

  private patchText(messageId: string, isStreaming?: boolean): void {
    const pending = this.pendingTexts.get(messageId);
    const idx = this.itemsValue.findIndex((i) => i.kind === 'text' && i.messageId === messageId);
    const existing = idx >= 0 ? (this.itemsValue[idx] as AgUiTextItem) : undefined;
    const updated: AgUiTextItem = {
      kind: 'text',
      messageId,
      role: pending?.role ?? existing?.role ?? 'assistant',
      text: pending?.buffer ?? existing?.text ?? '',
      isStreaming: isStreaming ?? existing?.isStreaming ?? false,
    };
    this.itemsValue = idx >= 0 ? replaceAt(this.itemsValue, idx, updated) : [...this.itemsValue, updated];
  }

  private patchReasoning(messageId: string, isStreaming?: boolean): void {
    const pending = this.pendingReasoning.get(messageId);
    const idx = this.itemsValue.findIndex((i) => i.kind === 'reasoning' && i.messageId === messageId);
    const existing = idx >= 0 ? (this.itemsValue[idx] as AgUiReasoningItem) : undefined;
    const updated: AgUiReasoningItem = { kind: 'reasoning', messageId, text: pending?.buffer ?? existing?.text ?? '', isStreaming: isStreaming ?? existing?.isStreaming ?? false };
    this.itemsValue = idx >= 0 ? replaceAt(this.itemsValue, idx, updated) : [...this.itemsValue, updated];
  }

  private patchToolItem(toolCallId: string, patch: { status?: AgUiToolCallStatus; result?: unknown; error?: string }): void {
    const idx = this.itemsValue.findIndex((i) => i.kind === 'toolCall' && i.toolCallId === toolCallId);
    if (idx < 0) return;
    const existing = this.itemsValue[idx] as AgUiToolCallItem;
    this.itemsValue = replaceAt(this.itemsValue, idx, { ...existing, status: patch.status ?? existing.status, result: patch.result ?? existing.result, error: patch.error ?? existing.error });
  }

  private replaceItem(toolCallId: string, replacement: AgUiGenerativeItem): void {
    const idx = this.itemsValue.findIndex((i) => i.kind === 'toolCall' && i.toolCallId === toolCallId);
    this.itemsValue = idx >= 0 ? replaceAt(this.itemsValue, idx, replacement) : [...this.itemsValue, replacement];
  }
}

function replaceAt<T>(arr: T[], index: number, value: T): T[] {
  const copy = [...arr];
  copy[index] = value;
  return copy;
}

function parseArgs(raw: string): Record<string, unknown> {
  if (raw.trim().length === 0) return {};
  try {
    const decoded: unknown = JSON.parse(raw);
    return decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? (decoded as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
