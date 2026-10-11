import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatController } from '../src/chat/chat-controller.js';
import { ChatActivityIndicator } from '../src/chat/components/ChatActivityIndicator.js';
import { ChatDiscussion } from '../src/chat/components/ChatDiscussion.js';

const started = { type: 'RUN_STARTED', threadId: 't1', runId: 'r1' } as const;
const finished = { type: 'RUN_FINISHED', threadId: 't1', runId: 'r1' } as const;

/** Lets the delay before the indicator shows go by. */
const wait = (ms = 400) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe('ChatActivityIndicator', () => {
  it('shows nothing when nothing is going on', () => {
    render(<ChatActivityIndicator activity={undefined} />);
    wait();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('waits for its delay, so a quick answer shows nothing at all', () => {
    const { rerender } = render(<ChatActivityIndicator activity={{}} />);
    wait(100);
    expect(screen.queryByText('Thinking…')).toBeNull();

    // The answer came before the delay was over.
    rerender(<ChatActivityIndicator activity={undefined} />);
    wait();
    expect(screen.queryByText('Thinking…')).toBeNull();
  });

  it('shows after the delay and goes at once when the work is over', () => {
    const { rerender } = render(<ChatActivityIndicator activity={{}} />);
    wait();
    expect(screen.getByText('Thinking…')).toBeInTheDocument();

    rerender(<ChatActivityIndicator activity={undefined} />);
    expect(screen.queryByText('Thinking…')).toBeNull();
  });

  it('says what the app says, else who is at work, else that it is thinking', () => {
    const { rerender } = render(<ChatActivityIndicator activity={{ label: 'Reading your files', memberName: 'Writer' }} />);
    wait();
    expect(screen.getByText('Reading your files')).toBeInTheDocument();

    // What is said changes without the indicator going away and waiting again.
    rerender(<ChatActivityIndicator activity={{ memberName: 'Writer' }} />);
    expect(screen.getByText('Writer is working on it…')).toBeInTheDocument();
  });

  it('takes its animation, its mark, its colour and its wording from its style', () => {
    render(
      <ChatActivityIndicator
        activity={{ stepName: 'fetch' }}
        style={{ animation: 'spin', icon: <svg data-testid="mark" />, color: 'tomato', periodMs: 800, delayMs: 0, label: (a) => `Step ${a.stepName}`, className: 'mine' }}
      />,
    );
    const line = screen.getByRole('status');
    expect(line).toHaveClass('ag-chat-activity', 'ag-chat-activity--spin', 'mine');
    expect(line.style.getPropertyValue('--ag-chat-activity-color')).toBe('tomato');
    expect(line.style.getPropertyValue('--ag-chat-activity-period')).toBe('800ms');
    expect(screen.getByTestId('mark')).toBeInTheDocument();
    expect(screen.getByText('Step fetch')).toBeInTheDocument();
  });

  it('draws three dots by default, and keeps its text for screen readers when the label is hidden', () => {
    render(<ChatActivityIndicator activity={{}} style={{ delayMs: 0, showLabel: false }} />);
    const line = screen.getByRole('status');
    expect(line).toHaveClass('ag-chat-activity--dots');
    expect(line.querySelectorAll('.ag-chat-activity__mark > span')).toHaveLength(3);
    expect(screen.getByText('Thinking…')).toHaveClass('ag-sr-only');
  });

  it('can be drawn entirely by the app', () => {
    render(<ChatActivityIndicator activity={{}} style={{ delayMs: 0 }} render={() => <em>my own</em>} />);
    expect(screen.getByText('my own')).toBeInTheDocument();
    expect(screen.queryByText('Thinking…')).toBeNull();
  });
});

describe('ChatDiscussion activity', () => {
  const chat = (controller: ChatController, props: Partial<Parameters<typeof ChatDiscussion>[0]> = {}) => (
    <ChatDiscussion controller={controller} onSend={() => {}} showActivityIndicator {...props} />
  );

  it('is off unless asked for', () => {
    const controller = new ChatController();
    render(<ChatDiscussion controller={controller} onSend={() => {}} />);
    act(() => controller.feedEvent(started));
    wait();
    expect(screen.queryByText('Thinking…')).toBeNull();
  });

  it('shows while the run works and goes when it finishes', () => {
    const controller = new ChatController();
    render(chat(controller));
    wait();
    expect(screen.queryByText('Thinking…')).toBeNull();

    act(() => controller.feedEvent(started));
    wait();
    expect(screen.getByText('Thinking…')).toBeInTheDocument();

    act(() => controller.feedEvent(finished));
    expect(screen.queryByText('Thinking…')).toBeNull();
  });

  it('goes when the run fails', () => {
    const controller = new ChatController();
    render(chat(controller));
    act(() => controller.feedEvent(started));
    wait();
    expect(screen.getByText('Thinking…')).toBeInTheDocument();

    act(() => controller.feedEvent({ type: 'RUN_ERROR', message: 'out of credit' }));
    expect(screen.queryByText('Thinking…')).toBeNull();
  });

  it('goes when the app says its source of events is gone', () => {
    const controller = new ChatController();
    render(chat(controller));
    act(() => controller.feedEvent(started));
    wait();
    expect(screen.getByText('Thinking…')).toBeInTheDocument();

    act(() => controller.streamEnded());
    expect(controller.isAwaitingResponse).toBe(false);
    expect(screen.queryByText('Thinking…')).toBeNull();
  });

  it('goes when the run stops to ask something', () => {
    const controller = new ChatController();
    render(chat(controller, { onHilResponse: () => {} }));
    act(() => controller.feedEvent(started));
    wait();
    expect(screen.getByText('Thinking…')).toBeInTheDocument();

    act(() =>
      controller.feedEvent({
        type: 'RUN_FINISHED',
        threadId: 't1',
        runId: 'r1',
        outcome: { kind: 'interrupt', interrupts: [{ id: 'gate1', reason: 'chat_hil_gate', message: 'Which one?', metadata: { threadId: 't1' } }] },
      }),
    );
    expect(screen.queryByText('Thinking…')).toBeNull();
  });

  it("follows what the app says of the run, and says the app's own words", () => {
    const controller = new ChatController();
    const { rerender } = render(chat(controller, { running: true, activityLabel: 'Building the team' }));
    wait();
    expect(screen.getByText('Building the team')).toBeInTheDocument();

    rerender(chat(controller, { running: false, activityLabel: 'Building the team' }));
    expect(screen.queryByText('Building the team')).toBeNull();
  });

  it('names the member at work', () => {
    const controller = new ChatController();
    render(chat(controller));
    act(() => {
      controller.feedEvent(started);
      controller.feedEvent({ type: 'STEP_STARTED', stepName: 'writer-turn', memberEntityId: 'a1', displayName: 'Writer' });
    });
    wait();
    expect(screen.getByText('Writer is working on it…')).toBeInTheDocument();
    expect(controller.currentStep).toBe('writer-turn');

    act(() => controller.feedEvent({ type: 'STEP_FINISHED', stepName: 'writer-turn', memberEntityId: 'a1' }));
    expect(controller.currentStep).toBeUndefined();
    // The run is still working: the line stays, back to its plain wording.
    expect(screen.getByText('Thinking…')).toBeInTheDocument();
  });
});
