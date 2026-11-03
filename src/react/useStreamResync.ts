import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ChatController } from '../chat/chat-controller.js';
import type { ChatMessage } from '../chat/chat-models.js';
import type { AgentivityClient } from '../client/agentivity-client.js';
import { useExecutionStatusesOf } from './useExecutionStatuses.js';

/** How long the chat may look at work while the execution says its turn has ended, before it reads again what happened. */
export const STREAM_RESYNC_AFTER_MS = 8_000;
/** How long the stream says nothing, while the chat is at work, before the execution is asked where it stands. */
const STREAM_SILENCE_MS = 20_000;

/**
 * A chat that lost its stream (the server started again during a turn) must not show "at work" for ever: once the execution's
 * progress says its turn has ended while the chat still waits, the chat stops waiting, and what was written meanwhile is read back
 * from the conversation, with the question it waits on, if any. Nothing happens while the stream keeps up.
 */
export function useStreamResync(client: AgentivityClient | undefined, controller: ChatController, executionId: string | undefined): void {
  const busy = useSyncExternalStore(controller.subscribe, () => controller.isAwaitingResponse || controller.activeMember != null);
  // The execution is asked only once the stream has said nothing for a while: one that keeps up costs nothing.
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    if (!busy) {
      setQuiet(false);
      return;
    }
    let timer = setTimeout(() => setQuiet(true), STREAM_SILENCE_MS);
    const unsubscribe = controller.subscribe(() => {
      clearTimeout(timer);
      setQuiet(false);
      timer = setTimeout(() => setQuiet(true), STREAM_SILENCE_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [controller, busy]);
  const { executionState } = useExecutionStatusesOf(client, busy && quiet ? executionId : undefined, { intervalMs: 4000 });
  const turnEnded = executionState !== '' && executionState !== 'running' && executionState !== 'pending';

  useEffect(() => {
    if (!client || !executionId || !busy || !turnEnded) return;
    let alive = true;
    const timer = setTimeout(() => {
      if (!alive || !(controller.isAwaitingResponse || controller.activeMember)) return;
      controller.streamEnded();
      void readBack(client, controller, executionId, executionState === 'waitingforinput' || executionState === 'paused').catch(() => undefined);
    }, STREAM_RESYNC_AFTER_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [client, controller, executionId, busy, turnEnded, executionState]);
}

async function readBack(client: AgentivityClient, controller: ChatController, executionId: string, waits: boolean): Promise<void> {
  const threads = await client.conversations.fetchExecutionThreads(executionId);
  const thread = threads.find((t) => t.isDefault) ?? threads[0];
  if (thread) {
    if (!controller.threads.some((t) => t.threadId === thread.threadId))
      controller.addThread({ threadId: thread.threadId, contextId: '', runId: thread.runId ?? '', title: thread.title, isDefault: true, status: thread.status });
    const known = controller.messagesFor(thread.threadId);
    const ids = new Set(known.map((m) => m.id));
    const read = await client.conversations.fetchExecutionThreadMessages({ executionId, threadId: thread.threadId });
    // Ids the chat knows mark what it has already; with none in common, it has as many as it shows, in the same order.
    const shared = read.some((m) => ids.has(m.messageId));
    read.forEach((m, i) => {
      if (shared ? ids.has(m.messageId) : i < known.length) return;
      const message: ChatMessage = {
        id: m.messageId,
        role: m.authorType === 'user' ? 'user' : m.authorType === 'system' ? 'system' : 'assistant',
        contextId: '',
        threadId: thread.threadId,
        runId: m.runId ?? '',
        text: m.text,
        authorId: m.authorId,
        authorName: m.authorName,
        metadata: m.metadata,
        createdAt: m.createdAt ?? new Date(),
      };
      controller.addMessage(thread.threadId, message);
    });
  }
  if (!waits || controller.pendingHilGate) return;
  const pending = await client.runs.fetchPendingHil(executionId);
  const request = pending.requests[0];
  if (request && !controller.pendingHilGate)
    controller.setHilGate({ requestId: request.requestId, threadId: thread?.threadId ?? '', question: request.question ?? '', title: typeof request['title'] === 'string' ? request['title'] : 'Input required' });
}
