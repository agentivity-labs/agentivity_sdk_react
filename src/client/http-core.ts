import { ApiException, throwIfApiFailurePayload } from './api-contract.js';
import type { ConnectionMonitor } from './connection-monitor.js';
import { SlowCalls } from './slow-calls.js';

const API_V1 = '/api/v1';

/**
 * The token of a user of an API key (`agu_…`), worth a few minutes: got by your server, with the key, for one of your users, or by
 * signing in through the key for a person of the workspace. `expiresAt`, when known, lets the client ask for the next one in time.
 */
export interface UserToken {
  token: string;
  expiresAt?: string | number | Date;
}

/** Asks for the next token of the user: your server again, or the instance for a person signed in through the key. */
export type RenewUserToken = () => Promise<UserToken>;

// A token is asked again this long before its end, so that no request goes with one about to end.
const RENEW_BEFORE_MS = 60_000;

function expiryOf(token: UserToken): number | undefined {
  if (token.expiresAt === undefined) return undefined;
  const at = token.expiresAt instanceof Date ? token.expiresAt.getTime() : typeof token.expiresAt === 'number' ? token.expiresAt : Date.parse(token.expiresAt);
  return Number.isFinite(at) ? at : undefined;
}

// Whether the instance refused the request for its user token (wrong, or past its end), rather than for anything else.
async function refusedToken(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  try {
    return ((await response.clone().json()) as { error?: string })?.error === 'invalid_user_token';
  } catch {
    return false;
  }
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | string[] | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /**
   * The response body is data, not an error envelope: a 2xx body whose `status` is "failed" is NOT turned into an exception.
   * For endpoints that report a run's own status (an execution's inspector says `"status": "Failed"` for a run that failed — that
   * is the answer, not a failed request).
   */
  dataBody?: boolean;
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

  /** The address of the instance, as given (normalized). */
  get instanceUrl(): string {
    return this.baseUrl;
  }
  readonly fetchImpl: typeof fetch;
  /** Told whenever a request gets no answer (the server cannot be reached) and whenever one does. */
  readonly monitor?: ConnectionMonitor;
  /** How long a read waits, in all, for a hosted workspace that starts again (see {@link waitBeforeAskingAgain}). */
  private readonly startWaitMs: number;
  /** Since when a call waits for its answer (see {@link SlowCalls}): what an app shows as "Just a moment…". */
  readonly slow = new SlowCalls();

  /** The fetch given, without what the client adds: for a call that says its own Authorization. */
  readonly plainFetch: typeof fetch;
  private readonly apiKey?: string;
  private userToken?: { token: string; expiresAt?: number };
  private renewUserToken?: RenewUserToken;
  private renewing?: Promise<string>;

  /**
   * `apiKey`: on an instance that asks to sign in, the API key an administrator made for your system (`agv_…`); sent with every
   * request as `Authorization: Bearer`. It stays on your server, never in a web page or an installed app: a page speaks with the
   * token of its user ({@link setUserToken}), which your server gets with the key, or as a visitor of a demo.
   */
  constructor(args: { baseUrl: string; fetchImpl?: typeof fetch; monitor?: ConnectionMonitor; apiKey?: string; workspaceStartWaitMs?: number }) {
    this.baseUrl = normalizeBaseUrl(args.baseUrl);
    this.startWaitMs = args.workspaceStartWaitMs ?? WORKSPACE_START_WAIT_MS;
    this.plainFetch = args.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.apiKey = args.apiKey?.trim() || undefined;
    this.fetchImpl = this.authorized(this.plainFetch);
    this.monitor = args.monitor;
  }

  /**
   * Speaks for a user of an API key from now on: every request carries their token rather than the key. `renew` asks for the next
   * one: a minute before its end, and when the instance refuses it (the request is then sent once more). Without a token yet,
   * `renew` is asked for one at the first request. `null` and no `renew`: the client speaks for no user any more.
   */
  setUserToken(token: string | UserToken | null, renew?: RenewUserToken): void {
    const given = typeof token === 'string' ? { token } : token;
    this.userToken = given?.token ? { token: given.token, expiresAt: expiryOf(given) } : undefined;
    this.renewUserToken = renew;
    this.renewing = undefined;
  }

  /** The token of the user the client speaks for, if any. */
  get currentUserToken(): string | undefined {
    return this.userToken?.token;
  }

  // Every request of the client carries the user's token, or else the key, unless the caller gave its own Authorization.
  private authorized(fetchImpl: typeof fetch): typeof fetch {
    return async (input, init) => {
      const headers = new Headers(init?.headers);
      if (headers.has('Authorization')) return fetchImpl(input, init);
      const credential = await this.credential();
      if (credential) headers.set('Authorization', `Bearer ${credential}`);
      const response = await fetchImpl(input, { ...init, headers });
      if (!this.renewUserToken || !this.userToken || !(await refusedToken(response))) return response;
      const again = new Headers(headers);
      again.set('Authorization', `Bearer ${await this.renewNow()}`);
      return fetchImpl(input, { ...init, headers: again });
    };
  }

  private async credential(): Promise<string | undefined> {
    if (this.renewUserToken && (!this.userToken || (this.userToken.expiresAt !== undefined && this.userToken.expiresAt - Date.now() < RENEW_BEFORE_MS))) return this.renewNow();
    return this.userToken?.token ?? this.apiKey;
  }

  // One renewal at a time: the requests that wait for it all go with the token it brings.
  private renewNow(): Promise<string> {
    const renew = this.renewUserToken!;
    this.renewing ??= renew()
      .then((next) => {
        this.userToken = { token: next.token, expiresAt: expiryOf(next) };
        return next.token;
      })
      .finally(() => {
        this.renewing = undefined;
      });
    return this.renewing;
  }

  /** Asks the server for anything (the icon catalog): true when ANY answer came back, even an error status; false when it cannot be reached. */
  async probe(): Promise<boolean> {
    try {
      await this.fetchImpl(this.resolveUrl(AgentivityHttpCore.v1('/icons')), { method: 'GET', headers: { Accept: 'application/json' } });
      return true;
    } catch {
      return false;
    }
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
    return (await this.send<T>(method, path, body, options)).data;
  }

  private send<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<{ data: T; headers: Headers }> {
    return this.slow.follow(() => this.sendNow<T>(method, path, body, options));
  }

  private async sendNow<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<{ data: T; headers: Headers }> {
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
    // A hosted workspace sleeps when nobody uses it, and starts again at the next call: a read is asked again while it starts
    // (the gateway says so with 502, 503 or 504), as long as it says to wait, for two minutes at most. A write is never sent twice.
    const startedAt = Date.now();
    for (;;) {
      try {
        response = await this.fetchImpl(url, { method, headers, body: payload, signal: options?.signal });
      } catch (error) {
        // Cancelled on purpose (a component unmounted): not a connection problem.
        if (!(error instanceof DOMException && error.name === 'AbortError')) this.monitor?.httpFailed(error instanceof Error ? error.message : String(error));
        throw ApiException.fromNetworkError(error);
      }
      const wait = waitBeforeAskingAgain(method, response, Date.now() - startedAt, this.startWaitMs);
      if (wait === null || options?.signal?.aborted) break;
      // Not "can't reach the server": the workspace is starting, and the call that waits says so (`client.waiting`).
      await new Promise<void>((resolve) => setTimeout(resolve, wait));
    }
    // A gateway answering for a server that is down (502/503/504) is the same as no answer; anything else proves the server is there.
    if (response.status === 502 || response.status === 503 || response.status === 504) this.monitor?.httpFailed(`The server answered ${response.status} (${response.statusText || 'unavailable'})`);
    else this.monitor?.httpReachable();

    const contentType = response.headers.get('content-type') ?? '';
    const data: unknown = contentType.includes('application/json') ? await response.json().catch(() => undefined) : undefined;

    if (!response.ok) {
      throw ApiException.fromResponse(data, response.status);
    }
    if (!options?.dataBody) throwIfApiFailurePayload(data, response.status);
    return { data: data as T, headers: response.headers };
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  /** A GET whose response headers say something too (a total, say), given back with its body. */
  getWithHeaders<T>(path: string, options?: RequestOptions): Promise<{ data: T; headers: Headers }> {
    return this.send<T>('GET', path, undefined, options);
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

/** How long a read waits for a workspace that starts, in all: as long as its gateway holds a call for it. */
export const WORKSPACE_START_WAIT_MS = 120_000;

/**
 * How long to wait before asking again (a read only, while the gateway says the workspace is not there yet), or null to take the
 * answer as it is. The wait is what `Retry-After` says (3 s when it says nothing), never past {@link WORKSPACE_START_WAIT_MS}.
 */
export function waitBeforeAskingAgain(method: string, response: Response, waitedMs: number, mostMs = WORKSPACE_START_WAIT_MS): number | null {
  if (method !== 'GET' && method !== 'HEAD') return null;
  if (response.status !== 502 && response.status !== 503 && response.status !== 504) return null;
  const said = Number(response.headers.get('retry-after'));
  const wait = Number.isFinite(said) && said > 0 ? Math.min(said, 10) * 1000 : 3_000;
  return waitedMs + wait > mostMs ? null : wait;
}
