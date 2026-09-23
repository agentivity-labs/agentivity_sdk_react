import type { FormRequest, FormResponse, FormSubmitResult } from './form-models.js';

/**
 * Generic form provider — implement this against any backend. Port of
 * `IFormProvider`.
 *
 * `channel` is an optional discriminator for backends that expose multiple
 * form channels (e.g. `"forms"`, `"approvals"`). Omit for the default channel.
 */
export interface IFormProvider {
  listPending(args: { contextId: string; channel?: string }): Promise<FormRequest[]>;
  fetchRequest(args: { contextId: string; requestId: string; channel?: string }): Promise<FormRequest>;
  submitResponse(args: { contextId: string; requestId: string; response: FormResponse; channel?: string }): Promise<FormSubmitResult>;
}
