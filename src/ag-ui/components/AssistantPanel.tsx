import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AssistantController } from '../assistant/assistant-controller.js';
import type { AssistantMessage } from '../assistant/assistant-models.js';
import { MarkdownBody } from './MarkdownBody.js';

export interface AssistantPanelProps {
  controller: AssistantController;
  /** Replace the default message bubble entirely. */
  messageBuilder?: (message: AssistantMessage) => ReactNode;
  /** Replace the default text input row. */
  inputBuilder?: (onSend: (text: string) => void) => ReactNode;
  emptyBuilder?: () => ReactNode;
  inputHint?: string;
  /** Calls `controller.checkHealth()` on mount. */
  autoCheckHealth?: boolean;
  /** Show the online/offline status bar at the top. */
  showStatusBar?: boolean;
  /** Optional context forwarded verbatim to the backend on each message. */
  context?: Record<string, unknown>;
  className?: string;
}

/**
 * A self-contained AI assistant chat panel backed by {@link AssistantController}
 * — port of `AgUiAssistantPanel`.
 */
export function AssistantPanel({ controller, messageBuilder, inputBuilder, emptyBuilder, inputHint = 'Ask the assistant…', autoCheckHealth = true, showStatusBar = true, context, className }: AssistantPanelProps) {
  const messages = useSyncExternalStore(controller.subscribe, () => controller.messages);
  const isSending = useSyncExternalStore(controller.subscribe, () => controller.isSending);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoCheckHealth) void controller.checkHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount, matching the Flutter panel's initState behavior
  }, [controller]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isSending]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput('');
    void controller.sendMessage({ content: trimmed, context });
  }

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {showStatusBar && <StatusBar controller={controller} />}

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {messages.length === 0
          ? (emptyBuilder?.() ?? <div style={{ textAlign: 'center', opacity: 0.6, fontSize: 13 }}>No messages yet.</div>)
          : messages.map((m, i) => (messageBuilder ? <div key={i}>{messageBuilder(m)}</div> : <AssistantBubble key={i} message={m} />))}
        {isSending && <TypingIndicator />}
      </div>

      <div style={{ borderTop: '1px solid var(--ag-outline-variant, #e2e8f0)' }} />

      {inputBuilder ? (
        inputBuilder(send)
      ) : (
        <div style={{ display: 'flex', gap: 8, padding: 8 }}>
          <input
            value={input}
            disabled={isSending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
            placeholder={inputHint}
            style={{ flex: 1, fontSize: 13, padding: '10px 12px', border: '1px solid var(--ag-outline-variant, #e2e8f0)', borderRadius: 4 }}
          />
          <button
            type="button"
            disabled={isSending}
            onClick={() => send(input)}
            aria-label="Send"
            style={{ border: 'none', background: 'none', cursor: isSending ? 'default' : 'pointer', color: isSending ? 'var(--ag-outline, #94a3b8)' : 'var(--ag-primary, #2563eb)', fontSize: 16 }}
          >
            ↑
          </button>
        </div>
      )}
    </div>
  );
}

// ── Status bar ─────────────────────────────────────────────────────────────

function StatusBar({ controller }: { controller: AssistantController }) {
  const isOnline = useSyncExternalStore(controller.subscribe, () => controller.isOnline);
  const isChecking = useSyncExternalStore(controller.subscribe, () => controller.isCheckingHealth);
  const statusLabel = useSyncExternalStore(controller.subscribe, () => controller.statusLabel);
  const tokens = useSyncExternalStore(controller.subscribe, () => controller.lastResponseTokens);

  const dotColor = isChecking ? 'var(--ag-tertiary, #f59e0b)' : isOnline ? '#22c55e' : '#ef4444';
  const label = isChecking ? 'Checking…' : isOnline ? statusLabel : 'Offline';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', fontSize: 11 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
      <span style={{ opacity: 0.7 }}>{label}</span>
      {tokens != null && (
        <>
          <span style={{ flex: 1 }} />
          <span style={{ opacity: 0.5 }}>{tokens} tokens</span>
        </>
      )}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────

function AssistantBubble({ message }: { message: AssistantMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
        <span style={{ padding: '6px 12px', borderRadius: 12, background: 'var(--ag-surface-container-highest, #f1f5f9)', fontSize: 12, opacity: 0.75 }}>{message.content}</span>
      </div>
    );
  }

  const bg = isUser ? 'var(--ag-primary-container, #dbeafe)' : 'var(--ag-secondary-container, #f1f5f9)';
  const textColor = isUser ? 'var(--ag-on-primary-container, #1e3a8a)' : 'var(--ag-on-secondary-container, #1e293b)';
  const useMarkdown = !isUser && message.content.length > 0;

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '75%', margin: '4px 0', padding: '10px 14px', borderRadius: 12, background: bg, color: textColor }}>
        {useMarkdown ? <MarkdownBody data={message.content} textColor={textColor} /> : message.content}
      </div>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', padding: '8px 16px', gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ag-outline, #94a3b8)', display: 'inline-block', animation: `ag-pulse-opacity 1.2s ease-in-out ${i * 0.15}s infinite alternate` }}
        />
      ))}
    </div>
  );
}
