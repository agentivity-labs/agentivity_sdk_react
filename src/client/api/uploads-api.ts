import { AgentivityHttpCore } from '../http-core.js';

/** What the platform keeps of an uploaded file — the reference a workflow reads it back by. */
export interface UploadedFile {
  /** Opaque id; pass it to the workflow (a `document.extract_text` node reads the file from it). */
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
}

/**
 * Hands a file to the platform for a run to read later (a CV, a contract…). The file is stored
 * server-side for a limited time and is never served back over HTTP — only the workflow that
 * receives the `fileId` can read it.
 */
export class UploadsApi {
  private readonly c: AgentivityHttpCore;

  constructor(c: AgentivityHttpCore) {
    this.c = c;
  }

  /** Uploads `file` and returns its reference. Throws `ApiException` on failure (`file_too_large`, `file_required`). */
  async upload(file: Blob, fileName?: string): Promise<UploadedFile> {
    const name = fileName?.trim() || (file instanceof File ? file.name : '') || 'upload';
    const form = new FormData();
    form.set('file', file, name);

    const data = await this.c.post<Record<string, unknown>>(AgentivityHttpCore.v1('/uploads'), form);
    return {
      fileId: String(data?.['fileId'] ?? ''),
      name: typeof data?.['name'] === 'string' ? (data['name'] as string) : name,
      mimeType: typeof data?.['mimeType'] === 'string' ? (data['mimeType'] as string) : 'application/octet-stream',
      size: typeof data?.['size'] === 'number' ? (data['size'] as number) : file.size,
    };
  }
}
