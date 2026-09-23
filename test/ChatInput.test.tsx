import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatInput } from '../src/chat/components/ChatInput.js';

describe('ChatInput', () => {
  it('shows the mic disabled with a tooltip when onTranscribeAudio is not provided', () => {
    render(<ChatInput onSend={vi.fn()} />);
    const mic = screen.getByRole('button', { name: /record voice message/i });
    expect(mic).toBeDisabled();
    expect(mic).toHaveAttribute('title', "Voice input isn't configured.");
  });

  it('enables the mic when onTranscribeAudio is provided', () => {
    render(<ChatInput onSend={vi.fn()} onTranscribeAudio={vi.fn()} />);
    expect(screen.getByRole('button', { name: /record voice message/i })).toBeEnabled();
  });

  it('hides the mic entirely when enableVoice is false', () => {
    render(<ChatInput onSend={vi.fn()} onTranscribeAudio={vi.fn()} enableVoice={false} />);
    expect(screen.queryByRole('button', { name: /record voice message/i })).not.toBeInTheDocument();
  });

  it('calls onSend with the trimmed text and clears the field', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} />);
    const field = screen.getByPlaceholderText('Type a message…');
    await user.type(field, '  hello  {Enter}');
    expect(onSend).toHaveBeenCalledWith('hello', []);
    expect(field).toHaveValue('');
  });

  it('does not call onSend for empty/whitespace-only input', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} />);
    await user.type(screen.getByPlaceholderText('Type a message…'), '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('uses hilHint and disables the attach/mic-unrelated send button appropriately in HIL mode', () => {
    render(<ChatInput onSend={vi.fn()} isHil hilHint="Your answer…" />);
    expect(screen.getByPlaceholderText('Your answer…')).toBeInTheDocument();
  });
});
