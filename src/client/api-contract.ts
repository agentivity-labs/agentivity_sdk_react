/**
 * Shared error envelope parsing for the Agentivity backend — mirrors the Flutter
 * SDK's `api_contract.dart`. The backend wraps failures in an envelope of the shape
 * `{ status: "failed", error: { code, message, detail, context } }` (or flattened at
 * the top level); this module normalizes both into {@link ApiException}.
 */

export interface ApiErrorPayload {
  status?: string;
  httpStatus?: number;
  code?: string;
  userMessage?: string;
  detail?: string;
  context?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

function readString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function readInt(v: unknown): number | undefined {
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'string') {
    const n = Number.parseInt(v, 10);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** Fallback message shown when the backend didn't supply a `userMessage`. */
export function apiFallbackMessageForStatus(httpStatus?: number): string {
  if (httpStatus == null) return 'Something went wrong. Please try again.';
  if (httpStatus === 401 || httpStatus === 403) return "You don't have permission to do that.";
  if (httpStatus === 404) return "That couldn't be found.";
  if (httpStatus === 408 || httpStatus === 504) return 'The request timed out. Please try again.';
  if (httpStatus === 409) return 'That conflicts with the current state.';
  if (httpStatus === 422) return 'That request is invalid.';
  if (httpStatus === 429) return 'Too many requests. Please slow down.';
  if (httpStatus >= 500) return 'The server had a problem. Please try again shortly.';
  return 'Something went wrong. Please try again.';
}

export function tryParseApiErrorPayload(value: unknown, httpStatus?: number): ApiErrorPayload | undefined {
  const map = asRecord(value);
  if (!map) return undefined;
  const nestedError = asRecord(map['error']);
  const source = nestedError ?? map;
  const status = readString(source['status']) ?? readString(map['status']);
  const parsedHttpStatus = readInt(source['httpStatus']) ?? readInt(map['httpStatus']) ?? httpStatus;
  const code = readString(source['code']) ?? readString(map['code']);
  const userMessage = readString(source['userMessage']) ?? readString(source['message']) ?? readString(map['userMessage']) ?? readString(map['message']);
  const detail = readString(source['detail']) ?? readString(map['detail']);
  const context = asRecord(source['context']) ?? asRecord(map['context']);
  const looksLikeError =
    nestedError != null ||
    (status ?? '').toLowerCase() === 'failed' ||
    (parsedHttpStatus != null && parsedHttpStatus >= 400) ||
    code != null ||
    userMessage != null ||
    detail != null;
  if (!looksLikeError) return undefined;
  return { status, httpStatus: parsedHttpStatus, code, userMessage, detail, context, raw: map };
}

export function isFailurePayload(payload: ApiErrorPayload): boolean {
  return (payload.status ?? '').toLowerCase() === 'failed' || (payload.httpStatus ?? 0) >= 400;
}

export function resolvedUserMessage(payload: ApiErrorPayload): string {
  return payload.userMessage?.trim() || apiFallbackMessageForStatus(payload.httpStatus);
}

/**
 * A failed Agentivity API call — either a non-2xx HTTP response, a network error,
 * or a 2xx response whose JSON body reports `"status": "failed"` (soft failure).
 */
export class ApiException extends Error {
  readonly httpStatus?: number;
  readonly code?: string;
  readonly detail?: string;
  readonly context?: Record<string, unknown>;
  readonly raw?: Record<string, unknown>;
  /** True when this was a network/transport failure rather than a server-reported error. */
  readonly isNetworkError: boolean;

  constructor(payload: ApiErrorPayload, options: { isNetworkError?: boolean } = {}) {
    super(resolvedUserMessage(payload));
    this.name = 'ApiException';
    this.httpStatus = payload.httpStatus;
    this.code = payload.code;
    this.detail = payload.detail;
    this.context = payload.context;
    this.raw = payload.raw;
    this.isNetworkError = options.isNetworkError ?? false;
  }

  static fromResponse(body: unknown, httpStatus: number): ApiException {
    const payload = tryParseApiErrorPayload(body, httpStatus) ?? { httpStatus };
    return new ApiException(payload);
  }

  static fromNetworkError(error: unknown): ApiException {
    const message = error instanceof Error ? error.message : String(error);
    return new ApiException({ detail: message }, { isNetworkError: true });
  }
}

/** Throws {@link ApiException} if `body` is a soft-failure envelope (2xx HTTP, `status: "failed"`). */
export function throwIfApiFailurePayload(body: unknown, httpStatus?: number): void {
  const payload = tryParseApiErrorPayload(body, httpStatus);
  if (payload && isFailurePayload(payload)) {
    throw new ApiException(payload);
  }
}

/** Extracts a user-presentable message from any thrown error — {@link ApiException} or otherwise. */
export function userFacingErrorMessage(error: unknown): string {
  if (error instanceof ApiException) return error.message;
  if (error instanceof Error) {
    const message = error.message.trim();
    return message.length === 0 ? 'An unexpected error occurred.' : message;
  }
  const message = String(error).trim();
  return message.length === 0 ? 'An unexpected error occurred.' : message;
}

export function apiErrorCode(error: unknown): string | undefined {
  return error instanceof ApiException ? error.code : undefined;
}

export function apiHttpStatus(error: unknown): number | undefined {
  return error instanceof ApiException ? error.httpStatus : undefined;
}

/** Logs API failures to the console in development only (mirrors `debugLogApiIssue`). */
export function debugLogApiIssue(error: unknown, options: { operation?: string } = {}): void {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['NODE_ENV'];
  if (env === 'production') return;
  const prefix = options.operation || 'API issue';
  // eslint-disable-next-line no-console -- intentional dev-only diagnostic logging
  console.warn(`[${prefix}]`, userFacingErrorMessage(error), error);
}
