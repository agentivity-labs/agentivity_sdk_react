import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';

export interface ChatInputProps {
  /** Called when the user submits. `attachments` is cleared after the callback runs. */
  onSend: (text: string, attachments: File[]) => void;
  /** Placeholder shown in normal mode. */
  hint?: string;
  /** Text the input starts with. Read once, when the input is first shown. */
  initialText?: string;
  /** Placeholder shown when `isHil` is true. */
  hilHint?: string;
  minRows?: number;
  maxRows?: number;
  /** Puts this text back in the field: what was sent could not go through. A new object each time. */
  restore?: { text: string };
  /** Told what the field holds, whenever it changes. */
  onTextChange?: (text: string) => void;
  /** When false, the field and all buttons are disabled. */
  enabled?: boolean;
  /** When true, the send button shows a spinner. */
  loading?: boolean;
  /**
   * A run is in progress. With `onStop` the send button becomes a stop button (■) — the way every chat app lets you
   * interrupt a model that is working — and Enter no longer sends.
   */
  running?: boolean;
  /** Called when the stop button is pressed. Providing it is what enables the stop button while `running`. */
  onStop?: () => void;
  /** The stop request is in flight: the stop button shows a spinner and cannot be pressed twice. */
  stopping?: boolean;
  /** Switches into HIL (human-in-the-loop) mode: uses `hilHint` and a distinct style. */
  isHil?: boolean;
  /** Shows a microphone button. Actual dictation only works when `onTranscribeAudio` is also provided. */
  enableVoice?: boolean;
  /**
   * Uploads the recorded audio for server-side transcription and returns the transcribed
   * text. `undefined` (the default) means voice transcription isn't available — the mic is
   * shown disabled with a `title` tooltip rather than hidden outright. The component stays
   * IO-free itself (like `onSend`): the host owns the actual network call, typically gated
   * on a capability check (e.g. `client.voice.checkStatus()`).
   */
  onTranscribeAudio?: (audio: Blob, mimeType: string) => Promise<string | undefined>;
  /** What the field says under it when dictation fails: nothing was heard, or the mic could not be used. */
  voiceProblemTexts?: { notHeard?: string; noMic?: string };
  /** Shows the attachment button. */
  enableAttachments?: boolean;
  /** File extensions accepted by the picker (e.g. `['png', 'jpg']`). Omit to accept everything. */
  acceptedExtensions?: string[];
  className?: string;
}

/**
 * A configurable chat input bar — React port of the Flutter SDK's `AgUiChatInput`.
 *
 * Voice recording uses the browser's `MediaRecorder` API directly (no PCM/WAV
 * wrapping needed — the Agentivity backend's Whisper endpoint accepts the
 * container `MediaRecorder` produces, typically `audio/webm`), unlike the
 * Flutter port which needed a raw-PCM capture for its live waveform. This
 * component shows a simple "Recording…" state instead of a waveform for v1.
 */
export function ChatInput({
  onSend,
  hint = 'Type a message…',
  initialText,
  restore,
  onTextChange,
  hilHint = 'Type your response…',
  minRows = 1,
  maxRows = 6,
  enabled = true,
  loading = false,
  running = false,
  onStop,
  stopping = false,
  isHil = false,
  enableVoice = true,
  onTranscribeAudio,
  voiceProblemTexts,
  enableAttachments = true,
  acceptedExtensions,
  className,
}: ChatInputProps) {
  const [text, setText] = useState(initialText ?? '');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  // A dictation that failed says so under the field, until the next try or a word typed: a mic that just stops looks broken.
  const [voiceProblem, setVoiceProblem] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    if (restore) setText(restore.text);
  }, [restore]);

  useEffect(() => {
    onTextChange?.(text);
  }, [text, onTextChange]);

  const disabled = !enabled || loading;

  const stoppable = running && !!onStop;

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled || stoppable) return;
    onSend(trimmed, attachments);
    setText('');
    setAttachments([]);
  }, [text, attachments, disabled, stoppable, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFilesPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    if (picked.length > 0) setAttachments((prev) => [...prev, ...picked]);
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleRecording = useCallback(async () => {
    if (!onTranscribeAudio) return;
    const notHeard = voiceProblemTexts?.notHeard ?? 'Could not hear that. Try again, or type it.';
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    setVoiceProblem(undefined);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        if (blob.size === 0) {
          setVoiceProblem(notHeard);
          return;
        }
        setIsTranscribing(true);
        onTranscribeAudio(blob, mimeType)
          .then((transcribed) => {
            if (transcribed?.trim()) setText((prev) => (prev ? `${prev} ${transcribed}` : transcribed));
            else setVoiceProblem(notHeard);
          })
          .catch((error: unknown) => {
            if (typeof console !== 'undefined') console.warn('onTranscribeAudio failed', error);
            setVoiceProblem(notHeard);
          })
          .finally(() => setIsTranscribing(false));
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      if (typeof console !== 'undefined') console.warn('Could not start audio recording', error);
      setVoiceProblem(voiceProblemTexts?.noMic ?? 'The mic could not be used. Allow it in the browser, or type your message.');
    }
  }, [isRecording, onTranscribeAudio, voiceProblemTexts]);

  const voiceUnavailable = !onTranscribeAudio;
  const canSend = text.trim().length > 0 && !disabled;

  return (
    <div className={cx('ag-chat-input', isHil && 'ag-chat-input--hil', loading && 'ag-chat-input--loading', className)}>
      {attachments.length > 0 && (
        <div className="ag-chat-input__attachments">
          {attachments.map((file, i) => (
            <span key={`${file.name}-${i}`} className="ag-chat-input__chip">
              {file.name}
              <button type="button" onClick={() => removeAttachment(i)} aria-label={`Remove ${file.name}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        className="ag-chat-input__field"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setVoiceProblem(undefined);
        }}
        onKeyDown={handleKeyDown}
        placeholder={isHil ? hilHint : hint}
        disabled={disabled}
        rows={minRows}
        style={{ maxHeight: `${maxRows * 1.4}em` }}
      />

      {voiceProblem && (
        <p className="ag-chat-input__problem" role="status">
          {voiceProblem}
        </p>
      )}

      <div className="ag-chat-input__toolbar">
        <div className="ag-chat-input__toolbar-leading">
          {enableAttachments && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                accept={acceptedExtensions?.map((ext) => `.${ext}`).join(',')}
                onChange={handleFilesPicked}
              />
              <button
                type="button"
                className="ag-chat-input__icon-button"
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach file"
                title="Attach file"
              >
                +
              </button>
            </>
          )}
          {enableVoice && (
            <button
              type="button"
              className={cx('ag-chat-input__icon-button', isRecording && 'ag-chat-input__icon-button--recording')}
              disabled={disabled || voiceUnavailable || isTranscribing}
              onClick={() => void toggleRecording()}
              aria-label={isRecording ? 'Stop recording' : 'Record voice message'}
              title={voiceUnavailable ? "Voice input isn't configured." : isRecording ? 'Stop recording' : 'Record voice message'}
            >
              {isTranscribing ? '…' : isRecording ? '■' : '🎤'}
            </button>
          )}
        </div>
        {stoppable ? (
          <button type="button" className="ag-chat-input__send ag-chat-input__send--stop" disabled={stopping} onClick={onStop} aria-label="Stop" title="Stop">
            {stopping ? '…' : '■'}
          </button>
        ) : (
          <button type="button" className="ag-chat-input__send" disabled={!canSend} onClick={handleSend} aria-label="Send">
            {loading ? '…' : '↑'}
          </button>
        )}
      </div>
    </div>
  );
}

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}
