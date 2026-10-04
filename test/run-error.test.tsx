import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatController } from '../src/chat/chat-controller.js';
import { ChatDiscussion } from '../src/chat/components/ChatDiscussion.js';
import { describeRunError } from '../src/chat/components/ChatRunError.js';
import { parseAgUiEvent } from '../src/protocol/events.js';

const feed = (c: ChatController, json: Record<string, unknown>) => act(() => c.feedEvent(parseAgUiEvent(json)));

describe('a run that ends on an error', () => {
  it('is kept by the controller with its code, until the next run or a dismissal', () => {
    const c = new ChatController();
    feed(c, { type: 'RUN_ERROR', message: 'Needs Analyst: The AI service (Anthropic) refused the request.', code: 'llm_billing' });

    expect(c.runError).toEqual({ message: 'Needs Analyst: The AI service (Anthropic) refused the request.', code: 'llm_billing' });

    feed(c, { type: 'RUN_STARTED', runId: 'r2' });
    expect(c.runError).toBeUndefined();

    feed(c, { type: 'RUN_ERROR', message: 'boom' });
    c.dismissRunError();
    expect(c.runError).toBeUndefined();
  });

  it('is cleared with the conversation', () => {
    const c = new ChatController();
    feed(c, { type: 'RUN_ERROR', message: 'boom' });
    c.clear();
    expect(c.runError).toBeUndefined();
  });

  it('shows the member whose step failed as failed, not done', () => {
    const c = new ChatController();
    feed(c, { type: 'STEP_STARTED', stepName: 'a', memberEntityId: 'm1', displayName: 'Needs Analyst' });
    feed(c, { type: 'STEP_FINISHED', stepName: 'a', memberEntityId: 'm1', displayName: 'Needs Analyst', error: 'out of credit' });
    feed(c, { type: 'STEP_STARTED', stepName: 'b', memberEntityId: 'm2' });
    feed(c, { type: 'STEP_FINISHED', stepName: 'b', memberEntityId: 'm2' });

    expect(c.memberStatuses.get('m1')).toBe('failed');
    expect(c.memberStatuses.get('m2')).toBe('done');
  });
});

describe('the error notice', () => {
  it('words an account out of credit for the end user, and keeps what the provider said', () => {
    const c = new ChatController();
    render(<ChatDiscussion controller={c} />);
    expect(screen.queryByRole('alert')).toBeNull();

    feed(c, { type: 'RUN_ERROR', message: 'Needs Analyst: The AI service (Anthropic) refused the request because the account is out of credit. (Anthropic says: Your credit balance is too low)', code: 'llm_billing' });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('The AI service is out of credit');
    expect(alert.textContent).toContain('Add credit to the AI provider account');
    expect(alert.textContent).toContain('Your credit balance is too low');
    expect(alert.getAttribute('data-code')).toBe('llm_billing');
  });

  it('can be dismissed', () => {
    const c = new ChatController();
    render(<ChatDiscussion controller={c} />);
    feed(c, { type: 'RUN_ERROR', message: 'boom' });
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');

    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('has a headline for each code the platform reports, and a plain one for the rest', () => {
    expect(describeRunError({ message: '', code: 'llm_auth' }).title).toBe('The AI service rejected its API key');
    expect(describeRunError({ message: '', code: 'llm_rate_limited' }).title).toBe('The AI service is busy');
    expect(describeRunError({ message: '', code: 'llm_unavailable' }).title).toBe('The AI service is unavailable');
    expect(describeRunError({ message: '', code: 'tool_call_failed' }).title).toBe('Something went wrong');
    expect(describeRunError({ message: '' }).title).toBe('Something went wrong');
  });
});
