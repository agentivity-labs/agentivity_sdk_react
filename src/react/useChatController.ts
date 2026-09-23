import { useMemo, useSyncExternalStore } from 'react';
import { ChatController } from '../chat/chat-controller.js';
import type { ChatHilGate, ChatMessage, ChatThread } from '../chat/chat-models.js';

export interface UseChatControllerResult {
  controller: ChatController;
  threads: ChatThread[];
  /** Locally-cached messages for `threadId`, or `[]` if unset/empty. */
  messages: ChatMessage[];
  isAwaitingResponse: boolean;
  pendingHilGate: ChatHilGate | undefined;
}

/**
 * React binding for {@link ChatController} — subscribes via `useSyncExternalStore`
 * so the component re-renders whenever the controller's state changes (a new
 * thread, a new/updated message, a streamed delta, a HIL gate).
 *
 * Feed it AG-UI events from {@link useRunStream} (or any other source):
 *
 * ```tsx
 * const controller = useMemo(() => new ChatController({ contextId: runId }), [runId]);
 * const { events } = useRunStream(streamUrl);
 * useEffect(() => { events.forEach(controller.feedEvent); }, [events, controller]);
 * const { threads, messages } = useChatController(controller, activeThreadId);
 * ```
 */
export function useChatController(controller: ChatController, threadId: string | undefined): UseChatControllerResult {
  const threads = useSyncExternalStore(controller.subscribe, () => controller.threads);
  const messages = useSyncExternalStore(controller.subscribe, () => (threadId ? controller.messagesFor(threadId) : EMPTY));
  const isAwaitingResponse = useSyncExternalStore(controller.subscribe, () => controller.isAwaitingResponse);
  const pendingHilGate = useSyncExternalStore(controller.subscribe, () => controller.pendingHilGate);

  return useMemo(
    () => ({ controller, threads, messages, isAwaitingResponse, pendingHilGate }),
    [controller, threads, messages, isAwaitingResponse, pendingHilGate],
  );
}

const EMPTY: ChatMessage[] = [];
