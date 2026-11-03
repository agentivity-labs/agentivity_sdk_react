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

  it('a mic that cannot be opened shows a card: how to allow it, Try again that asks again, and a close button', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const user = userEvent.setup();
    render(<ChatInput onSend={vi.fn()} onTranscribeAudio={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /record voice message/i }));
    const card = await screen.findByRole('status');
    expect(card).toHaveTextContent('The mic is blocked');
    expect(card).toHaveTextContent('set Microphone to Allow');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('status')).toHaveTextContent('The mic is blocked');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says so under the field when what was said could not be turned into text', async () => {
    class Recorder {
      mimeType = 'audio/webm';
      ondataavailable?: (event: { data: Blob }) => void;
      onstop?: () => void;
      start() {}
      stop() {
        this.ondataavailable?.({ data: new Blob(['x']) });
        this.onstop?.();
      }
    }
    vi.stubGlobal('MediaRecorder', Recorder);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) } });
    const user = userEvent.setup();
    render(<ChatInput onSend={vi.fn()} onTranscribeAudio={vi.fn().mockRejectedValue(new Error('503'))} voiceProblemTexts={{ notHeard: 'Pas compris.' }} />);
    await user.click(screen.getByRole('button', { name: /record voice message/i }));
    await user.click(screen.getByRole('button', { name: /stop recording/i }));
    expect(await screen.findByRole('status')).toHaveTextContent('Pas compris.');
    vi.unstubAllGlobals();
  });

  it('uses hilHint and disables the attach/mic-unrelated send button appropriately in HIL mode', () => {
    render(<ChatInput onSend={vi.fn()} isHil hilHint="Your answer…" />);
    expect(screen.getByPlaceholderText('Your answer…')).toBeInTheDocument();
  });
});
