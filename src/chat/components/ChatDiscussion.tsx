import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ChatController } from '../chat-controller.js';
import type { ChatHilGate, ChatMessage } from '../chat-models.js';
import { isDisplayWidget, type AgUiWidgetRegistry } from '../../artifacts/widget-registry.js';
import { ChatMessageBubble } from './ChatMessageBubble.js';
import { ChatInput } from './ChatInput.js';
import { ChatActiveMemberIndicator } from './ChatActiveMemberIndicator.js';
import { ChatRunError } from './ChatRunError.js';
import { ChatConnectionNotice } from './ChatConnectionNotice.js';
import { useOptionalAgentivityClient } from '../../react/AgentivityProvider.js';
import type { AgUiChatMember, AgUiMemberAvatar } from './member-avatar.js';

export interface ChatDiscussionProps {
  controller: ChatController;
  /** Pin to a specific thread. Omit to auto-select the default (or first) thread. */
  threadId?: string;
  widgetRegistry?: AgUiWidgetRegistry;
  /** Called when the user sends a plain (non-HIL) message. */
  onSend: (text: string, attachments: File[]) => void;
  /**
   * Called when the user submits a response to a pending HIL gate. `source` is
   * `'text'` when typed in the input, or `'widget'` when submitted through an
   * interaction widget (ChoiceCard, QuestionForm…).
   */
  onHilResponse?: (gate: ChatHilGate, text: string, source: string) => void | Promise<void>;
  /**
   * Called when the user presses the stop button in the input box — the interrupt every chat app offers while a model is
   * working. Providing it turns the send button into a stop button for as long as a run is in progress; the app cancels
   * the run (e.g. `client.runs.cancelExecution`). Off by default: without it the input behaves as before.
   */
  onStop?: () => void | Promise<void>;
  /**
   * Whether the app knows a run is in progress (drives the stop button), e.g. from `useExecutionStatuses`, which is right on a
   * reopened execution too. Combined with what the stream reports (`controller.isAwaitingResponse`): either one is enough,
   * since an execution's status API does not always report a resumed team as running yet.
   */
  running?: boolean;
  /**
   * Shows a "member at work" indicator (avatar + name + animated dots) above the input
   * while a Team member is taking its turn (driven by `controller.activeMember`). Off by
   * default; has no effect for a standalone Agent, which never sets `activeMember`.
   */
  showActiveMemberIndicator?: boolean;
  /**
   * Shows an avatar+name header above each assistant bubble, identifying which Team
   * member sent it. Off by default; has no effect for a standalone Agent's messages
   * (they carry no author identity).
   */
  showSpeakerLabels?: boolean;
  /**
   * Maps a member's identity ({@link AgUiChatMember}) to an avatar (image/emoji/color).
   * Shared by both {@link showActiveMemberIndicator} and {@link showSpeakerLabels}. Falls
   * back to a deterministic initials+color avatar when omitted or returning `undefined`.
   */
  resolveMemberAvatar?: (member: AgUiChatMember) => AgUiMemberAvatar | undefined;
  messageBuilder?: (message: ChatMessage) => ReactNode;
  emptyBuilder?: () => ReactNode;
  inputHint?: string;
  hilInputHint?: string;
  enableVoice?: boolean;
  onTranscribeAudio?: (audio: Blob, mimeType: string) => Promise<string | undefined>;
  enableAttachments?: boolean;
  acceptedAttachmentExtensions?: string[];
  className?: string;
}

/**
 * A complete chat discussion — message list + composer, orchestrated as one
 * component, backed by a {@link ChatController}. React port of the Flutter
 * SDK's `AgUiChatDiscussion`.
 *
 * Push-based only (no pull/REST provider): feed the controller from
 * {@link useRunStream} or any other AG-UI event source, and pass `onSend` to
 * actually launch a run/send the message (the component stays IO-free).
 */
export function ChatDiscussion({
  controller,
  threadId,
  widgetRegistry,
  onSend,
  onHilResponse,
  onStop,
  running: runningProp,
  showActiveMemberIndicator = false,
  showSpeakerLabels = false,
  resolveMemberAvatar,
  messageBuilder,
  emptyBuilder,
  inputHint = 'Type a message…',
  hilInputHint = 'Type your response…',
  enableVoice = true,
  onTranscribeAudio,
  enableAttachments = true,
  acceptedAttachmentExtensions,
  className,
}: ChatDiscussionProps) {
  const threads = useSyncExternalStore(controller.subscribe, () => controller.threads);
  const pendingHilGate = useSyncExternalStore(controller.subscribe, () => controller.pendingHilGate);
  const activeMember = useSyncExternalStore(controller.subscribe, () => controller.activeMember);
  const runError = useSyncExternalStore(controller.subscribe, () => controller.runError);
  // Inside an AgentivityProvider the conversation says on its own when the server cannot be reached.
  const client = useOptionalAgentivityClient();
  const awaiting = useSyncExternalStore(controller.subscribe, () => controller.isAwaitingResponse);
  const [stopping, setStopping] = useState(false);

  const activeThreadId = threadId ?? (threads.find((t) => t.isDefault) ?? threads[0])?.threadId;
  const messages = useSyncExternalStore(controller.subscribe, () => (activeThreadId ? controller.messagesFor(activeThreadId) : EMPTY_MESSAGES));

  const [submittingHil, setSubmittingHil] = useState(false);
  async function stop() {
    if (!onStop || stopping) return;
    setStopping(true);
    try {
      await onStop();
    } finally {
      setStopping(false);
    }
  }
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (messages.length > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  const isHilActive = pendingHilGate != null;

  // Only the most recent message carrying an interactive widget may still be
  // answered — every earlier widget (resolved, or superseded by a later gate)
  // renders read-only.
  // A display widget (a chart, a cover image) is skipped: arriving after the question, it must not
  // take the question's place and leave the real one read-only.
  const lastWidgetIndex = useMemo(() => {
    const asks = (type: unknown) => typeof type === 'string' && !isDisplayWidget(widgetRegistry?.[type]);
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if ((m.blocks && m.blocks.some((b) => b.type !== 'text' && asks(b.type))) || asks(m.metadata?.['widgetType'])) return i;
    }
    return -1;
  }, [messages, widgetRegistry]);

  async function submitHilResponse(text: string, source = 'text') {
    const trimmed = text.trim();
    const gate = controller.pendingHilGate;
    if (!trimmed || submittingHil || !gate) return;
    setSubmittingHil(true);
    try {
      await onHilResponse?.(gate, trimmed, source);
      // Only the gate that was just answered: the response can return after the run has already reached its NEXT gate
      // (the reply request resolves once the run suspends again), and clearing unconditionally wiped that new question.
      if (controller.pendingHilGate?.requestId === gate.requestId) controller.clearHilGate();
    } finally {
      setSubmittingHil(false);
    }
  }

  function handleInputSend(text: string, attachments: File[]) {
    if (isHilActive) {
      void submitHilResponse(text);
    } else {
      onSend(text, attachments);
    }
  }

  const showEmpty = !activeThreadId && messages.length === 0 && !isHilActive;

  return (
    <div className={cx('ag-chat-discussion', className)}>
      <div className="ag-chat-discussion__messages" ref={scrollRef}>
        {showEmpty
          ? (emptyBuilder?.() ?? null)
          : messages.map((message, i) => {
              if (messageBuilder) return <div key={message.id}>{messageBuilder(message)}</div>;
              const isActiveWidget = isHilActive && i === lastWidgetIndex;
              return (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  widgetRegistry={widgetRegistry}
                  enabled={isActiveWidget}
                  onWidgetSubmit={isActiveWidget && onHilResponse ? (response) => void submitHilResponse(response, 'widget') : undefined}
                  showSpeakerLabel={showSpeakerLabels}
                  resolveMemberAvatar={resolveMemberAvatar}
                />
              );
            })}
      </div>

      {client && <ChatConnectionNotice monitor={client.connection} />}

      {runError && <ChatRunError error={runError} onDismiss={() => controller.dismissRunError()} />}

      {showActiveMemberIndicator && activeMember && <ChatActiveMemberIndicator member={activeMember} resolveMemberAvatar={resolveMemberAvatar} />}

      <div className="ag-chat-discussion__input">
        <ChatInput
          onSend={handleInputSend}
          hint={inputHint}
          hilHint={hilInputHint}
          isHil={isHilActive}
          loading={submittingHil}
          // A pending question means the run is waiting on the user — except while their reply is in flight: that request only
          // returns once the run suspends again, so the run IS working then and must stay stoppable.
          running={(runningProp === true || awaiting) && (!isHilActive || submittingHil)}
          onStop={onStop ? () => void stop() : undefined}
          stopping={stopping}
          enableVoice={enableVoice}
          onTranscribeAudio={onTranscribeAudio}
          enableAttachments={enableAttachments}
          acceptedExtensions={acceptedAttachmentExtensions}
        />
      </div>
    </div>
  );
}

const EMPTY_MESSAGES: ChatMessage[] = [];

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}
