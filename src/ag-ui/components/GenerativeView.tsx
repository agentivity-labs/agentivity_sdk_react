import { useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AgUiGenerativeController, AgUiGenerativeItem, AgUiHtmlItem, AgUiReasoningItem, AgUiTextItem, AgUiToolCallItem } from '../agent/generative-controller.js';
import type { AgUiWidgetRegistry } from '../../artifacts/widget-registry.js';
import { MarkdownBody } from './MarkdownBody.js';

export interface GenerativeViewProps {
  controller: AgUiGenerativeController;
  registry: AgUiWidgetRegistry;
  /** Full override — replaces rendering of any item type. */
  itemBuilder?: (item: AgUiGenerativeItem) => ReactNode;
  /** Override only tool-call items. */
  toolCallBuilder?: (item: AgUiToolCallItem) => ReactNode;
  /** Called when a component name is not in `registry`. */
  fallbackBuilder?: (component: string, props: Record<string, unknown>) => ReactNode;
  /**
   * Renders agent-generated HTML (`AgUiHtmlItem`). Provide an `<iframe>` (sandboxed)
   * or similar to display it. When omitted, a labelled placeholder is shown instead.
   */
  htmlBuilder?: (item: AgUiHtmlItem) => ReactNode;
  emptyBuilder?: () => ReactNode;
  className?: string;
  /**
   * Called when an interactive component (QuestionForm, ChoiceCard, ConfirmCard…)
   * submits its response. Injected as `__onSubmit` into the component's props.
   * When omitted, interactive widgets render read-only.
   */
  onComponentSubmit?: (response: string) => void;
}

/**
 * Renders a live conversation driven by {@link AgUiGenerativeController} —
 * port of `AgUiGenerativeView`.
 *
 * Items appear in stream order: text bubbles, reasoning blocks, inline
 * components (from `registry`), tool-call status cards, and agent-generated
 * HTML blocks.
 */
export function GenerativeView({ controller, registry, itemBuilder, toolCallBuilder, fallbackBuilder, htmlBuilder, emptyBuilder, className, onComponentSubmit }: GenerativeViewProps) {
  const items = useSyncExternalStore(controller.subscribe, () => controller.items);

  if (items.length === 0) return emptyBuilder?.() ?? null;

  return (
    <div className={className} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((item, i) => (
        <div key={itemKey(item, i)}>{itemBuilder ? itemBuilder(item) : buildItem(item, { registry, toolCallBuilder, fallbackBuilder, htmlBuilder, onComponentSubmit })}</div>
      ))}
    </div>
  );
}

function itemKey(item: AgUiGenerativeItem, i: number): string {
  switch (item.kind) {
    case 'text':
      return `text-${item.messageId}`;
    case 'reasoning':
      return `reasoning-${item.messageId}`;
    case 'toolCall':
      return `tool-${item.toolCallId}`;
    default:
      return `${item.kind}-${i}`;
  }
}

function buildItem(
  item: AgUiGenerativeItem,
  options: { registry: AgUiWidgetRegistry; toolCallBuilder?: (item: AgUiToolCallItem) => ReactNode; fallbackBuilder?: (component: string, props: Record<string, unknown>) => ReactNode; htmlBuilder?: (item: AgUiHtmlItem) => ReactNode; onComponentSubmit?: (response: string) => void },
): ReactNode {
  switch (item.kind) {
    case 'text':
      return <TextBubble item={item} />;
    case 'reasoning':
      return <ReasoningBlock item={item} />;
    case 'component': {
      const props = options.onComponentSubmit ? { ...item.props, __onSubmit: options.onComponentSubmit } : item.props;
      const builder = options.registry[item.component];
      if (builder) return builder(props);
      return options.fallbackBuilder?.(item.component, props) ?? <UnknownComponent name={item.component} />;
    }
    case 'toolCall':
      return options.toolCallBuilder?.(item) ?? <ToolCallCard item={item} />;
    case 'html':
      return options.htmlBuilder?.(item) ?? <HtmlPlaceholder item={item} />;
  }
}

// ── Text bubble ───────────────────────────────────────────────────────────────

function TextBubble({ item }: { item: AgUiTextItem }) {
  const isUser = item.role === 'user';
  const bg = isUser ? 'var(--ag-primary-container, #dbeafe)' : 'var(--ag-secondary-container, #f1f5f9)';
  const textColor = isUser ? 'var(--ag-on-primary-container, #1e3a8a)' : 'var(--ag-on-secondary-container, #1e293b)';
  // Render markdown only for assistant messages that have finished streaming.
  // Partial markdown (mid-stream) causes broken layouts — keep plain text while streaming.
  const useMarkdown = !isUser && !item.isStreaming && item.text.length > 0;

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '75%', margin: '4px 0', padding: '10px 14px', borderRadius: 12, background: bg, color: textColor }}>
        {useMarkdown ? (
          <MarkdownBody data={item.text} textColor={textColor} />
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 6 }}>
            {item.text}
            {item.isStreaming && <StreamingDot />}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Reasoning block ───────────────────────────────────────────────────────────

function ReasoningBlock({ item }: { item: AgUiReasoningItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ margin: '4px 0', borderRadius: 8, border: '1px solid var(--ag-outline-variant, #e2e8f0)', background: 'var(--ag-surface-container-highest, #f1f5f9)' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 13, opacity: 0.6 }}>🧠</span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>Thinking</span>
        {item.isStreaming && <StreamingDot />}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, opacity: 0.6 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && <div style={{ padding: '0 12px 12px', fontSize: 12, opacity: 0.75 }}>{item.text}</div>}
    </div>
  );
}

// ── Tool call card ────────────────────────────────────────────────────────────

const TOOL_STYLE: Record<string, { icon: string; color: string }> = {
  pending: { icon: '…', color: 'var(--ag-outline, #94a3b8)' },
  running: { icon: '↻', color: 'var(--ag-primary, #2563eb)' },
  completed: { icon: '✓', color: '#22c55e' },
  failed: { icon: '✕', color: '#ef4444' },
};

function ToolCallCard({ item }: { item: AgUiToolCallItem }) {
  const style = TOOL_STYLE[item.status]!;
  const label = item.status === 'pending' ? `Calling ${item.toolCallName}…` : item.status === 'running' ? `Running ${item.toolCallName}…` : item.toolCallName;
  const resultText = item.result != null ? String(item.result) : undefined;
  const truncated = resultText && resultText.length > 120 ? `${resultText.slice(0, 120)}…` : resultText;

  return (
    <div style={{ margin: '4px 0', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ag-outline-variant, #e2e8f0)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: style.color, fontSize: 13, animation: item.status === 'running' ? 'ag-spin 0.8s linear infinite' : undefined, display: 'inline-block' }}>{style.icon}</span>
        <span style={{ fontSize: 11, color: style.color, flex: 1 }}>{label}</span>
      </div>
      {item.error && <div style={{ marginTop: 4, fontSize: 12, color: '#ef4444' }}>{item.error}</div>}
      {truncated && item.status === 'completed' && <div style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>{truncated}</div>}
    </div>
  );
}

// ── Placeholders ──────────────────────────────────────────────────────────────

function UnknownComponent({ name }: { name: string }) {
  return (
    <div style={{ margin: '4px 0', padding: 12, borderRadius: 8, border: '1px solid var(--ag-outline-variant, #e2e8f0)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, opacity: 0.6 }}>
      <span>▦</span>
      Unregistered component: {name}
    </div>
  );
}

function HtmlPlaceholder({ item }: { item: AgUiHtmlItem }) {
  return (
    <div style={{ margin: '4px 0', padding: 12, height: item.height, borderRadius: 8, border: '1px solid var(--ag-outline-variant, #e2e8f0)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, opacity: 0.6 }}>
      <span>{'</>'}</span>
      HTML content — provide htmlBuilder to render.
    </div>
  );
}

function StreamingDot() {
  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ag-primary, #2563eb)', display: 'inline-block', animation: 'ag-pulse-opacity 0.7s ease-in-out infinite alternate' }} />;
}
