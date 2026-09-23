import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatMessageBubble } from '../src/chat/components/ChatMessageBubble.js';
import type { ChatMessage } from '../src/chat/chat-models.js';

function baseMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id: 'm1', role: 'assistant', contextId: 'c1', threadId: 't1', runId: '', text: 'Hello', ...overrides };
}

describe('ChatMessageBubble', () => {
  it('renders a user message', () => {
    render(<ChatMessageBubble message={baseMessage({ role: 'user', text: 'Hi there' })} />);
    expect(screen.getByText('Hi there')).toBeInTheDocument();
  });

  it('renders an assistant message', () => {
    render(<ChatMessageBubble message={baseMessage({ text: 'How can I help?' })} />);
    expect(screen.getByText('How can I help?')).toBeInTheDocument();
  });

  it('renders a system message distinctly', () => {
    const { container } = render(<ChatMessageBubble message={baseMessage({ role: 'system', text: 'Session started' })} />);
    expect(container.querySelector('.ag-chat-system-message')).not.toBeNull();
  });

  it('renders nothing for a widget-sourced HIL response echo', () => {
    const { container } = render(<ChatMessageBubble message={baseMessage({ metadata: { 'interaction.source': 'widget' } })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('resolves a standalone widget message through the registry', () => {
    const registry = { ChoiceCard: (props: Record<string, unknown>) => <div data-testid="choice-card">{String(props['label'])}</div> };
    render(<ChatMessageBubble message={baseMessage({ text: '', metadata: { widgetType: 'ChoiceCard', widgetProps: { label: 'Pick one' } } })} widgetRegistry={registry} />);
    expect(screen.getByTestId('choice-card')).toHaveTextContent('Pick one');
  });

  it('renders text and widget blocks from a multi-block message in order', () => {
    const registry = { ChoiceCard: () => <div data-testid="choice-card" /> };
    render(
      <ChatMessageBubble
        message={baseMessage({
          text: '',
          blocks: [
            { type: 'text', text: 'Please choose:' },
            { type: 'ChoiceCard', widgetProps: {} },
          ],
        })}
        widgetRegistry={registry}
      />,
    );
    expect(screen.getByText('Please choose:')).toBeInTheDocument();
    expect(screen.getByTestId('choice-card')).toBeInTheDocument();
  });

  it('injects __onSubmit into the widget props when onWidgetSubmit is provided', () => {
    const onWidgetSubmit = vi.fn();
    const registry = {
      ChoiceCard: (props: Record<string, unknown>) => (
        <button onClick={() => (props['__onSubmit'] as (r: string) => void)('yes')}>go</button>
      ),
    };
    render(
      <ChatMessageBubble
        message={baseMessage({ text: '', metadata: { widgetType: 'ChoiceCard', widgetProps: {} } })}
        widgetRegistry={registry}
        onWidgetSubmit={onWidgetSubmit}
      />,
    );
    screen.getByText('go').click();
    expect(onWidgetSubmit).toHaveBeenCalledWith('yes');
  });
});
