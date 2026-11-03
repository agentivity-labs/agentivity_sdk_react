import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ChatController } from '../chat-controller.js';
import type { ChatHilGate, ChatMessage } from '../chat-models.js';
import { isDisplayWidget, type AgUiWidgetRegistry } from '../../artifacts/widget-registry.js';
import { ChatMessageBubble } from './ChatMessageBubble.js';
import { ChatInput } from './ChatInput.js';
import { ChatActiveMemberIndicator } from './ChatActiveMemberIndicator.js';
import { ChatTeamProgress, type ChatTeamProgressTexts } from './ChatTeamProgress.js';
import { ChatActivityIndicator, type ChatActivity, type ChatActivityStyle } from './ChatActivityIndicator.js';
import { ChatRunError } from './ChatRunError.js';
import { ChatConversationEnd, type ChatConversationEndTexts } from './ChatConversationEnd.js';
import { ChatConnectionNotice } from './ChatConnectionNotice.js';
import { useOptionalAgentivityClient } from '../../react/AgentivityProvider.js';
import { useTeamProgress } from '../../react/useTeamProgress.js';
import { useStreamResync } from '../../react/useStreamResync.js';
import { isTeamProgressLive } from '../team-progress.js';
import type { AgUiChatMember, AgUiMemberAvatar } from './member-avatar.js';
import type { AgUiTeamMember } from './team-member.js';

export interface ChatDiscussionProps {
  controller: ChatController;
  /** Pin to a specific thread. Omit to auto-select the default (or first) thread. */
  threadId?: string;
  widgetRegistry?: AgUiWidgetRegistry;
  /**
   * Called when the user sends a plain (non-HIL) message. Let a failed `startExecution` reject: a conversation that has ended then
   * shows what comes next, and a conversation still at work keeps the text in the input. An app that catches it itself gives the
   * failure to `controller.noteSendRefused`.
   */
  onSend: (text: string, attachments: File[]) => void | Promise<void>;
  /**
   * The person starts another conversation, from zero: the app forgets its execution, so that the next message starts a new one, and
   * clears the controller. Providing it is what offers the choice, once a job is finished or a conversation has ended. `draft` is
   * what the input holds then (a message refused by the conversation that ended, say), for the new one to start with.
   */
  onNewConversation?: (draft: string) => void;
  /** Other words, or another language, for what is offered at the end of a job or of a conversation. */
  conversationEndTexts?: Partial<ChatConversationEndTexts>;
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
   * while a Team member is taking its turn (driven by `controller.activeMember`), not while a question it asked waits for
   * its answer. Off by default; has no effect for a standalone Agent, which never sets `activeMember`.
   */
  showActiveMemberIndicator?: boolean;
  /**
   * Shows a discreet "it is working" line (a small moving mark and a short text) above the input for as long as a run is
   * in progress, and removes it the moment the run ends, fails, is stopped or asks something. Off by default. It follows the
   * same signal as the stop button (`running` or `controller.isAwaitingResponse`) and appears only after
   * `activityStyle.delayMs`, so a quick answer shows none. While a Team member is shown by
   * {@link showActiveMemberIndicator}, that indicator stands in its place.
   */
  showActivityIndicator?: boolean;
  /**
   * What the app says is going on ("Reading your files"), shown instead of the default text. Left out, the default applies:
   * the member at work when there is one, otherwise `activityStyle.thinkingLabel`.
   */
  activityLabel?: string;
  /** The look of the activity indicator: animation, mark, colour, delay, wording. */
  activityStyle?: ChatActivityStyle;
  /** Draws the activity indicator instead of the default one. */
  renderActivity?: (activity: ChatActivity) => ReactNode;
  /**
   * Shows the team at work in the thread ({@link ChatTeamProgress}): one line per agent while an execution goes on, collapsed to one
   * line when it ends. On by default and needs nothing from the app; it appears once a team really works together, never for a
   * standalone Agent or a manager answering alone. While it shows, it stands in for the two indicators above.
   */
  showTeamProgress?: boolean;
  /** The execution {@link showTeamProgress} follows. Left out, the one the stream tells about; give it for an execution reopened from its history. */
  executionId?: string;
  /** The team's members, for a key that cannot read the team (a key for a web page). Left out, they are read from the execution's team. */
  teamMembers?: AgUiTeamMember[];
  /** Other words, or another language, for {@link showTeamProgress}. */
  teamProgressTexts?: Partial<ChatTeamProgressTexts>;
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
  /**
   * Text put in the input when the chat opens, for the person to send as it is or to complete (a request the app prepared
   * from what they were looking at). Read once: changing it later does not overwrite what they typed.
   */
  initialInputText?: string;
  enableVoice?: boolean;
  onTranscribeAudio?: (audio: Blob, mimeType: string) => Promise<string | undefined>;
  /** What the field says when dictation fails: see `ChatInput`'s `voiceProblemTexts`. */
  voiceProblemTexts?: { notHeard?: string; noMic?: string };
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
  onNewConversation,
  conversationEndTexts,
  onHilResponse,
  onStop,
  running: runningProp,
  showActiveMemberIndicator = false,
  showActivityIndicator = false,
  activityLabel,
  activityStyle,
  renderActivity,
  showTeamProgress = true,
  executionId,
  teamMembers,
  teamProgressTexts,
  showSpeakerLabels = false,
  resolveMemberAvatar,
  messageBuilder,
  emptyBuilder,
  inputHint = 'Type a message…',
  hilInputHint = 'Type your response…',
  initialInputText,
  enableVoice = true,
  onTranscribeAudio,
  voiceProblemTexts,
  enableAttachments = true,
  acceptedAttachmentExtensions,
  className,
}: ChatDiscussionProps) {
  const threads = useSyncExternalStore(controller.subscribe, () => controller.threads);
  const pendingHilGate = useSyncExternalStore(controller.subscribe, () => controller.pendingHilGate);
  const activeMember = useSyncExternalStore(controller.subscribe, () => controller.activeMember);
  const currentStep = useSyncExternalStore(controller.subscribe, () => controller.currentStep);
  const runError = useSyncExternalStore(controller.subscribe, () => controller.runError);
  // Inside an AgentivityProvider the conversation says on its own when the server cannot be reached.
  const client = useOptionalAgentivityClient();
  const awaiting = useSyncExternalStore(controller.subscribe, () => controller.isAwaitingResponse);
  const jobFinished = useSyncExternalStore(controller.subscribe, () => controller.jobFinished);
  const conversationEnded = useSyncExternalStore(controller.subscribe, () => controller.conversationEnded);
  const [stopping, setStopping] = useState(false);
  const [restore, setRestore] = useState<{ text: string }>();
  // The offer read from the platform when a chat reopens goes when the person answers it, as the one the stream brought.
  const [offerAnswered, setOfferAnswered] = useState(false);
  const progress = useTeamProgress(controller, { executionId, members: teamMembers, enabled: showTeamProgress });
  const teamShown = progress?.visible === true;
  const teamAtWork = teamShown && isTeamProgressLive(progress);

  const activeThreadId = threadId ?? (threads.find((t) => t.isDefault) ?? threads[0])?.threadId;
  const messages = useSyncExternalStore(controller.subscribe, () => (activeThreadId ? controller.messagesFor(activeThreadId) : EMPTY_MESSAGES));

  const [submittingHil, setSubmittingHil] = useState(false);
  const [sending, setSending] = useState(false);
  const draft = useRef('');
  const noteDraft = useCallback((text: string) => {
    draft.current = text;
  }, []);
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

  // The team's list is new at the bottom of the thread: the person sees it come.
  useEffect(() => {
    if (teamAtWork && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [teamAtWork]);

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
      setOfferAnswered(true);
      // A message may wait a little for the turn before it to finish: the input says it is on its way meanwhile.
      setSending(true);
      void Promise.resolve()
        .then(() => onSend(text, attachments))
        .catch((error: unknown) => {
          const refused = controller.noteSendRefused(error);
          if (refused) setRestore({ text });
          else throw error;
        })
        .finally(() => setSending(false));
    }
  }

  const followed = executionId ?? controller.executionId;
  // A stream lost during a turn (the server started again) does not leave the chat at work for ever.
  useStreamResync(client, controller, followed);
  const ended = conversationEnded || progress?.closed === true;
  const offered = !ended && !isHilActive && !awaiting && runningProp !== true && (jobFinished || (progress?.jobFinished === true && !offerAnswered));
  async function closeConversation() {
    if (followed) await client?.runs.closeExecution(followed);
    controller.markConversationEnded();
  }
  function goOn() {
    setOfferAnswered(true);
    controller.dismissConversationEnd();
  }

  const showEmpty = !activeThreadId && messages.length === 0 && !isHilActive;

  const thread = showEmpty
    ? [<div key="empty">{emptyBuilder?.() ?? null}</div>]
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
      });
  if (teamShown) {
    // At the bottom while the team works; once it has ended, between the request and what came of it, as a line of steps.
    const request = messages.map((m) => m.role).lastIndexOf('user');
    const at = teamAtWork || request < 0 ? thread.length : request + 1;
    thread.splice(at, 0, <ChatTeamProgress key="team-progress" progress={progress} resolveMemberAvatar={resolveMemberAvatar} texts={teamProgressTexts} />);
  }

  return (
    <div className={cx('ag-chat-discussion', className)}>
      <div className="ag-chat-discussion__messages" ref={scrollRef}>
        {thread}
      </div>

      {client && <ChatConnectionNotice monitor={client.connection} />}

      {runError && <ChatRunError error={runError} onDismiss={() => controller.dismissRunError()} />}

      {(ended || offered) && <ChatConversationEnd kind={ended ? 'ended' : 'finished'} onContinue={goOn} onClose={client && followed ? () => void closeConversation() : undefined} onStartNew={onNewConversation ? () => onNewConversation(draft.current.trim()) : undefined} texts={conversationEndTexts} />}

      {/* A member that asked a question and waits for its answer is not at work: it says so again once the answer is on its way. */}
      {teamAtWork ? null : showActiveMemberIndicator && activeMember && (!isHilActive || submittingHil) ? (
        <ChatActiveMemberIndicator member={activeMember} resolveMemberAvatar={resolveMemberAvatar} />
      ) : (
        showActivityIndicator && (
          // Always mounted while the option is on, so that it keeps its own delay; it renders nothing when idle.
          <ChatActivityIndicator
            // Busy is what the stop button goes by. A question waiting for its answer is not work in progress; one whose
            // answer is on its way is.
            activity={
              (runningProp === true || awaiting) && (!isHilActive || submittingHil)
                ? { label: activityLabel, stepName: currentStep, memberEntityId: activeMember?.memberEntityId, memberName: activeMember?.displayName }
                : undefined
            }
            style={activityStyle}
            render={renderActivity}
          />
        )
      )}

      <div className="ag-chat-discussion__input">
        <ChatInput
          onSend={handleInputSend}
          hint={inputHint}
          hilHint={hilInputHint}
          initialText={initialInputText}
          restore={restore}
          onTextChange={noteDraft}
          isHil={isHilActive}
          loading={submittingHil || sending}
          // A pending question means the run is waiting on the user — except while their reply is in flight: that request only
          // returns once the run suspends again, so the run IS working then and must stay stoppable.
          running={(runningProp === true || awaiting) && (!isHilActive || submittingHil)}
          onStop={onStop ? () => void stop() : undefined}
          stopping={stopping}
          enableVoice={enableVoice}
          onTranscribeAudio={onTranscribeAudio}
          voiceProblemTexts={voiceProblemTexts}
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
