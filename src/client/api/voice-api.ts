import { AgentivityHttpCore } from '../http-core.js';

/**
 * Server-side voice transcription — the chat input's mic records audio and
 * uploads it here rather than running an on-device speech engine.
 *
 * Deliberately OpenAI Whisper only, credential-gated: {@link checkStatus} tells the
 * caller upfront whether transcription is even configured, so a UI can hide
 * or disable the mic instead of discovering unavailability via a failed upload.
 */
export class VoiceApi {
  private readonly c: AgentivityHttpCore;

  constructor(c: AgentivityHttpCore) {
    this.c = c;
  }

  /** Whether the platform has a speech-to-text credential configured. */
  async checkStatus(): Promise<boolean> {
    const data = await this.c.get<Record<string, unknown>>(AgentivityHttpCore.v1('/voice/status'));
    return data?.['available'] === true;
  }

  /**
   * Uploads `audioBytes` (e.g. a WAV file) for transcription.
   * Returns the transcribed text, or throws `ApiException` on failure
   * (including `stt_not_configured` if no credential is set).
   */
  async transcribe(audioBytes: Blob | ArrayBuffer | Uint8Array, mimeType: string, options?: { language?: string }): Promise<string> {
    const extension = mimeType.split('/').pop() ?? 'wav';
    const blob = audioBytes instanceof Blob ? audioBytes : new Blob([audioBytes as BlobPart], { type: mimeType });
    const form = new FormData();
    form.set('audio', blob, `audio.${extension}`);
    if (options?.language?.trim()) form.set('language', options.language.trim());

    const data = await this.c.post<Record<string, unknown>>(AgentivityHttpCore.v1('/voice/transcribe'), form);
    return typeof data?.['text'] === 'string' ? (data['text'] as string) : '';
  }
}
