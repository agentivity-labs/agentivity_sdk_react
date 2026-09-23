import { ApiException, throwIfApiFailurePayload } from './api-contract.js';

const API_V1 = '/api/v1';

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | string[] | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Internal HTTP transport shared by all `*Api` components — a thin `fetch` wrapper
 * with the Agentivity error-envelope handling baked in. Mirrors the Flutter SDK's
 * `AgentivityHttpCore` (Dio-based).
 *
 * Exposed publicly so sub-classes and sibling `*Api` objects can reach it, but
 * callers outside this package should never depend on it directly.
 */
export class AgentivityHttpCore {
  private readonly baseUrl: string;
  readonly fetchImpl: typeof fetch;

  constructor(args: { baseUrl: string; fetchImpl?: typeof fetch }) {
    this.baseUrl = normalizeBaseUrl(args.baseUrl);
    this.fetchImpl = args.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  static v1(path: string): string {
    return `${API_V1}${path}`;
  }

  /** Resolves a path (relative to the base URL) into an absolute request URL. */
  resolveUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(path.replace(/^\//, ''), this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const v of value) url.searchParams.append(key, String(v));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const url = this.resolveUrl(path, options?.query);
    const headers: Record<string, string> = { Accept: 'application/json', ...options?.headers };
    let payload: BodyInit | undefined;
    if (body !== undefined) {
      if (body instanceof FormData) {
        payload = body;
      } else {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, { method, headers, body: payload, signal: options?.signal });
    } catch (error) {
      throw ApiException.fromNetworkError(error);
    }

    const contentType = response.headers.get('content-type') ?? '';
    const data: unknown = contentType.includes('application/json') ? await response.json().catch(() => undefined) : undefined;

    if (!response.ok) {
      throw ApiException.fromResponse(data, response.status);
    }
    throwIfApiFailurePayload(data, response.status);
    return data as T;
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  delete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, body, options);
  }

  /** Opens a raw streaming (SSE) response — bypasses the JSON envelope handling above. */
  async openStream(path: string, options?: { lastEventId?: string; signal?: AbortSignal }): Promise<Response> {
    const url = this.resolveUrl(path);
    const headers: Record<string, string> = { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' };
    if (options?.lastEventId) headers['Last-Event-ID'] = options.lastEventId;
    return this.fetchImpl(url, { method: 'GET', headers, signal: options?.signal });
  }

  // ---------------------------------------------------------------------------
  // Shared utilities
  // ---------------------------------------------------------------------------

  requireNormalizedId(value: string, label: string): string {
    const normalized = value.trim();
    if (normalized.length === 0) throw new Error(`${label} is required`);
    return normalized;
  }

  normalizeNullableId(value: string | undefined): string | undefined {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : undefined;
  }

  /** Throws if `data` is a non-empty envelope that doesn't report `success: true`. */
  expectSuccessOrEmptyResponse(data: Record<string, unknown> | undefined, operation: string): void {
    if (!data || Object.keys(data).length === 0) return;
    if (data['success'] === true) return;
    throw new Error(`${operation} did not report success.`);
  }
}
