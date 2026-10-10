import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatMessageBubble } from '../src/chat/components/ChatMessageBubble.js';
import type { ChatMessage } from '../src/chat/chat-models.js';
import { displayWidget, isDisplayWidget } from '../src/artifacts/widget-registry.js';
import { buildArtifactsRegistry } from '../src/artifacts/registry.js';

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

describe('ChatMessageBubble — read-only widgets', () => {
  const widgetMessage = (type: string) => baseMessage({ text: '', metadata: { widgetType: type, widgetProps: {} } });
  const block = (container: HTMLElement) => container.querySelector<HTMLElement>('.ag-chat-widget-block')!;

  it('dims a widget that asked something once its question is closed, and makes it inert', () => {
    const registry = { ChoiceCard: () => <button>pick</button> };
    const { container } = render(<ChatMessageBubble message={widgetMessage('ChoiceCard')} widgetRegistry={registry} enabled={false} />);
    expect(block(container).style.opacity).toBe('0.55');
    expect(block(container).style.pointerEvents).toBe('none');
  });

  it('leaves that widget fully visible while its question is open', () => {
    const registry = { ChoiceCard: () => <button>pick</button> };
    const { container } = render(<ChatMessageBubble message={widgetMessage('ChoiceCard')} widgetRegistry={registry} enabled />);
    expect(block(container).style.opacity).toBe('');
    expect(block(container).style.pointerEvents).toBe('');
  });

  it('never dims a display widget: a result stays readable and its links stay usable', () => {
    const registry = { ReportCard: displayWidget(() => <a href="https://example.com/product">open</a>) };
    const { container } = render(<ChatMessageBubble message={widgetMessage('ReportCard')} widgetRegistry={registry} enabled={false} />);
    expect(block(container).style.opacity).toBe('');
    expect(block(container).style.pointerEvents).toBe('');
  });

  it('judges each widget of a multi-block message on its own', () => {
    const registry = { ReportCard: displayWidget(() => <span data-testid="report" />), ChoiceCard: () => <span data-testid="choice" /> };
    render(
      <ChatMessageBubble
        message={baseMessage({ text: '', blocks: [{ type: 'ReportCard', widgetProps: {} }, { type: 'ChoiceCard', widgetProps: {} }] })}
        widgetRegistry={registry}
        enabled={false}
      />,
    );
    expect(screen.getByTestId('report').parentElement!.style.opacity).toBe('');
    expect(screen.getByTestId('choice').parentElement!.style.opacity).toBe('0.55');
  });

  it('ships the built-in charts, data, media and recap widgets as display widgets, and the cards that collect an answer as questions', () => {
    const registry = buildArtifactsRegistry();
    for (const name of ['BarChart', 'RadarChart', 'MetricCard', 'KeyValue', 'CodeBlock', 'StatusCard', 'Timeline', 'ImageGallery', 'SummaryCard']) {
      expect(isDisplayWidget(registry[name]), name).toBe(true);
    }
    for (const name of ['QuestionForm', 'ChoiceCard', 'ConfirmCard', 'RatingCard', 'DatePickerCard', 'SourceInput']) {
      expect(isDisplayWidget(registry[name]), name).toBe(false);
    }
  });
});
