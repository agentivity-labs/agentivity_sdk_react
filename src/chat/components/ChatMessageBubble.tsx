import type { ChatMessage } from '../chat-models.js';
import { isDisplayWidget, type AgUiComponentBuilder, type AgUiWidgetRegistry } from '../../artifacts/widget-registry.js';
import { MarkdownBody } from '../../ag-ui/components/MarkdownBody.js';
import { MemberAvatar, type AgUiChatMember, type AgUiMemberAvatar } from './member-avatar.js';

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  widgetRegistry?: AgUiWidgetRegistry;
  /**
   * Whether this message's widget (if any) is still awaiting a response.
   * When `false`, a widget that asked something renders read-only (dimmed,
   * inert) — it belongs to a resolved or superseded HIL gate. A display widget
   * (see `displayWidget`) is never dimmed: it is a result, not a question.
   */
  enabled?: boolean;
  /** Called with the widget's response when the consumer submits it (e.g. ChoiceCard). */
  onWidgetSubmit?: (response: string) => void;
  /**
   * Shows an avatar+name header above this bubble when the message carries author
   * identity (`message.authorId`/`.authorName` — populated for a Team member's turn,
   * left unset for a standalone Agent). Off by default; no header is ever rendered
   * without both this flag and an author name to show.
   */
  showSpeakerLabel?: boolean;
  /** Maps a member's identity to an avatar (image/emoji/color). Falls back to initials+color when omitted. */
  resolveMemberAvatar?: (member: AgUiChatMember) => AgUiMemberAvatar | undefined;
  className?: string;
}

/**
 * Renders one {@link ChatMessage} — port of `_MessageBubble` in the Flutter
 * SDK's `ag_ui_chat_discussion.dart`. Handles: user/assistant/system roles,
 * multi-block messages (text + widgets in one bubble), standalone widget
 * messages, and hiding widget-sourced HIL responses (already shown by the
 * widget itself).
 */
export function ChatMessageBubble({ message, widgetRegistry, enabled = false, onWidgetSubmit, showSpeakerLabel, resolveMemberAvatar, className }: ChatMessageBubbleProps) {
  // Widget-sourced HIL responses are persisted for history but not rendered:
  // the interaction widget itself already displays the user's answer.
  if (message.metadata?.['interaction.source'] === 'widget') {
    return null;
  }

  const speakerName = message.authorName ?? message.authorId;
  const speakerLabel =
    showSpeakerLabel && speakerName ? (
      <div className="ag-chat-speaker">
        <MemberAvatar member={{ memberEntityId: message.authorId, displayName: message.authorName }} resolver={resolveMemberAvatar} className="ag-chat-speaker__avatar" />
        <span className="ag-chat-speaker__name">{speakerName}</span>
      </div>
    ) : null;

  if (message.role === 'user') {
    return (
      <div className={cx('ag-chat-bubble-row ag-chat-bubble-row--user', className)}>
        <div className="ag-chat-bubble ag-chat-bubble--user">{message.text}</div>
      </div>
    );
  }

  if (message.role === 'system') {
    return <div className={cx('ag-chat-system-message', className)}>{message.text}</div>;
  }

  const dimStyle = (builder: AgUiComponentBuilder) =>
    enabled || isDisplayWidget(builder) ? undefined : ({ opacity: 0.55, pointerEvents: 'none' } as const);
  const submitProps = onWidgetSubmit ? { __onSubmit: onWidgetSubmit } : {};

  // Multi-block messages (e.g. intro text + a widget in one call). Rendered
  // front-to-back in a single bubble.
  if (message.blocks && message.blocks.length > 0) {
    return (
      <>
        {speakerLabel}
        <div className={cx('ag-chat-bubble-row ag-chat-bubble-row--assistant', className)}>
          <div className="ag-chat-bubble ag-chat-bubble--assistant">
            {message.blocks.map((block, i) => {
              if (block.type === 'text') {
                return block.text ? <MarkdownBody key={i} data={block.text} className="ag-chat-text-block" /> : null;
              }
              const builder = widgetRegistry?.[block.type];
              if (!builder) return null;
              return (
                <div key={i} className="ag-chat-widget-block" style={dimStyle(builder)}>
                  {builder({ ...block.widgetProps, ...submitProps })}
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // Standalone widget message (agent-produced artifact) — widgetType/widgetProps
  // are stored in message.metadata by ChatController.
  const widgetType = message.metadata?.['widgetType'];
  if (typeof widgetType === 'string' && widgetRegistry) {
    const builder = widgetRegistry[widgetType];
    const rawProps = message.metadata?.['widgetProps'];
    const baseProps = rawProps && typeof rawProps === 'object' ? (rawProps as Record<string, unknown>) : {};
    if (builder) {
      return (
        <>
          {speakerLabel}
          <div className={cx('ag-chat-bubble-row ag-chat-bubble-row--assistant', className)}>
            <div className="ag-chat-widget-block" style={dimStyle(builder)}>
              {builder({ ...baseProps, ...submitProps })}
            </div>
          </div>
        </>
      );
    }
  }

  // Plain assistant text.
  return (
    <>
      {speakerLabel}
      <div className={cx('ag-chat-bubble-row ag-chat-bubble-row--assistant', className)}>
        <div className="ag-chat-bubble ag-chat-bubble--assistant">
          <MarkdownBody data={message.text} />
        </div>
      </div>
    </>
  );
}

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}
