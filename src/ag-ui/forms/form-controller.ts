import { debugLogApiIssue, userFacingErrorMessage } from '../../client/api-contract.js';
import type { FormRequest, FormResponse } from './form-models.js';
import type { IFormProvider } from './i-form-provider.js';

type Listener = () => void;

/**
 * Manages pending form/approval requests for a context against an
 * {@link IFormProvider} — port of `FormController`.
 */
export class FormController {
  private readonly provider: IFormProvider;
  private readonly contextId: string;
  /** Optional channel discriminator (e.g. "forms", "approvals"). */
  readonly channel?: string;
  private readonly listeners = new Set<Listener>();

  private requestsValue: FormRequest[] = [];
  private isLoadingValue = false;
  private errorMessageValue: string | undefined;
  private activeRequestIdValue: string | undefined;

  constructor(args: { provider: IFormProvider; contextId: string; channel?: string }) {
    this.provider = args.provider;
    this.contextId = args.contextId;
    this.channel = args.channel;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  get requests(): FormRequest[] {
    return this.requestsValue;
  }
  get isLoading(): boolean {
    return this.isLoadingValue;
  }
  get errorMessage(): string | undefined {
    return this.errorMessageValue;
  }
  get activeRequestId(): string | undefined {
    return this.activeRequestIdValue;
  }
  get hasPending(): boolean {
    return this.requestsValue.length > 0;
  }

  async loadPending(options: { forceRefresh?: boolean } = {}): Promise<void> {
    if (this.isLoadingValue && !options.forceRefresh) return;
    this.isLoadingValue = true;
    this.errorMessageValue = undefined;
    this.notify();
    try {
      this.requestsValue = await this.provider.listPending({ contextId: this.contextId, channel: this.channel });
      this.activeRequestIdValue = undefined;
    } catch (error) {
      debugLogApiIssue(error, { operation: 'FormController.loadPending' });
      this.errorMessageValue = userFacingErrorMessage(error);
    } finally {
      this.isLoadingValue = false;
      this.notify();
    }
  }

  fetchRequest(args: { requestId: string }): Promise<FormRequest> {
    return this.provider.fetchRequest({ contextId: this.contextId, requestId: args.requestId, channel: this.channel });
  }

  async submitResponse(args: { request: FormRequest; response: FormResponse }): Promise<void> {
    this.activeRequestIdValue = args.request.id;
    this.errorMessageValue = undefined;
    this.notify();
    try {
      await this.provider.submitResponse({ contextId: this.contextId, requestId: args.request.id, response: args.response, channel: this.channel ?? args.request.channel });
      this.requestsValue = this.requestsValue.filter((r) => r.id !== args.request.id);
    } catch (error) {
      debugLogApiIssue(error, { operation: 'FormController.submitResponse' });
      this.errorMessageValue = userFacingErrorMessage(error);
      throw error;
    } finally {
      this.activeRequestIdValue = undefined;
      this.notify();
    }
  }

  clearError(): void {
    this.errorMessageValue = undefined;
    this.notify();
  }
}
