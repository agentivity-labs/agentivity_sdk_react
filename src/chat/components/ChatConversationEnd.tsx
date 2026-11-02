export interface ChatConversationEndTexts {
  /** Said once a job is finished. */
  finished: string;
  /** Said when the conversation has ended. */
  ended: string;
  goOn: string;
  close: string;
  startAnother: string;
  startNew: string;
}

export const defaultChatConversationEndTexts: ChatConversationEndTexts = {
  finished: 'This job is finished. What next?',
  ended: 'This conversation has ended. Start a new one?',
  goOn: 'Continue',
  close: 'Close',
  startAnother: 'Start another',
  startNew: 'Start a new one',
};

export interface ChatConversationEndProps {
  /** `finished`: a job is finished and the conversation stays open. `ended`: nothing goes on here any more. */
  kind: 'finished' | 'ended';
  /** The person goes on here. Typing does the same. */
  onContinue?: () => void;
  /** Closes the conversation. No such choice when omitted. */
  onClose?: () => void;
  /** Starts a new conversation, from zero. No such choice when omitted. */
  onStartNew?: () => void;
  texts?: Partial<ChatConversationEndTexts>;
  className?: string;
}

/**
 * What comes next when a job is finished, or when a conversation has ended: only a choice of the person starts or ends anything.
 * Shown by `ChatDiscussion`.
 */
export function ChatConversationEnd({ kind, onContinue, onClose, onStartNew, texts, className }: ChatConversationEndProps) {
  const words = { ...defaultChatConversationEndTexts, ...texts };
  return (
    <div className={['ag-chat-conversation-end', className].filter(Boolean).join(' ')} role="group" data-kind={kind}>
      <div className="ag-chat-conversation-end__text">{kind === 'finished' ? words.finished : words.ended}</div>
      <div className="ag-chat-conversation-end__actions">
        {kind === 'finished' && onContinue && (
          <button type="button" className="ag-chat-conversation-end__action" onClick={onContinue}>
            {words.goOn}
          </button>
        )}
        {kind === 'finished' && onClose && (
          <button type="button" className="ag-chat-conversation-end__action" onClick={onClose}>
            {words.close}
          </button>
        )}
        {onStartNew && (
          <button type="button" className="ag-chat-conversation-end__action ag-chat-conversation-end__action--primary" onClick={onStartNew}>
            {kind === 'finished' ? words.startAnother : words.startNew}
          </button>
        )}
      </div>
    </div>
  );
}
