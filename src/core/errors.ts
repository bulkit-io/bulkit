import type { components } from '../generated/openapi';

export type ErrorBody = components['schemas']['ErrorDetail'];
export type FieldError = components['schemas']['FieldError'];
/**
 * Error codes documented today. New ones may be added without notice,
 * so the type stays open to any string.
 */
export type ErrorCode = ErrorBody['code'] | (string & {});

/** Base class for every error this SDK throws. `instanceof BulkitError` catches them all. */
export class BulkitError extends Error {
  override name = 'BulkitError';
}

/**
 * The API answered with a non-2xx status.
 *
 * Branch on `code` (stable within v1) rather than `message` (prose, may change).
 * New codes can appear at any time, so always keep a fallback branch.
 */
export class APIError extends BulkitError {
  override name = 'APIError';

  /** HTTP status code. */
  readonly status: number;
  /** Machine-readable error code, e.g. `content_too_long`. */
  readonly code: ErrorCode | undefined;
  /** Path into the request body (or the header name) that caused the failure. */
  readonly field: string | undefined;
  /** Every field-level failure when schema validation rejected more than one. */
  readonly details: FieldError[] | undefined;
  /** Quote this when contacting support: it is what Bulkit searches on. */
  readonly requestId: string | undefined;
  readonly headers: Headers;
  /** The parsed `error` object exactly as the API sent it. */
  readonly error: ErrorBody | undefined;

  constructor(status: number, error: ErrorBody | undefined, message: string, headers: Headers) {
    super(message);
    this.status = status;
    this.error = error;
    this.code = error?.code;
    this.field = error?.field ?? undefined;
    this.details = error?.details ?? undefined;
    this.requestId = error?.requestId ?? headers.get('x-request-id') ?? undefined;
    this.headers = headers;
  }

  /** @internal */
  static from(status: number, body: unknown, headers: Headers): APIError {
    const error = extractError(body);
    const message = error?.message ?? `Request failed with status ${status}`;
    const ErrorClass = errorClassFor(status);
    return new ErrorClass(status, error, message, headers);
  }
}

/** 400 — the request was malformed or failed schema validation. */
export class BadRequestError extends APIError {
  override name = 'BadRequestError';
}

/** 401 — the API key is missing, malformed, revoked or unknown. */
export class AuthenticationError extends APIError {
  override name = 'AuthenticationError';
}

/**
 * 402 — the plan's allowance for this period is spent.
 *
 * This is NOT a rate limit: retrying will never succeed until the period resets.
 * `client.usage.retrieve()` has the numbers and `periodEnd`. The SDK never retries it.
 */
export class QuotaExceededError extends APIError {
  override name = 'QuotaExceededError';
}

/** 403 — the key lacks the scope for this call (e.g. a read-only key attempting a write). */
export class PermissionDeniedError extends APIError {
  override name = 'PermissionDeniedError';
}

/** 404 — the resource does not exist in this workspace. */
export class NotFoundError extends APIError {
  override name = 'NotFoundError';
}

/** 409 — the resource is in a state that does not allow this, or a request with the same idempotency key is still running. */
export class ConflictError extends APIError {
  override name = 'ConflictError';
}

/** 413 — the request body or uploaded file is too large. */
export class PayloadTooLargeError extends APIError {
  override name = 'PayloadTooLargeError';
}

/** 415 — the uploaded file's type is not accepted. */
export class UnsupportedMediaTypeError extends APIError {
  override name = 'UnsupportedMediaTypeError';
}

/** 422 — well-formed but refused, e.g. a platform rule or an idempotency key reused with a different body. */
export class UnprocessableEntityError extends APIError {
  override name = 'UnprocessableEntityError';
}

/** 429 — too many requests. Retried automatically, honouring `Retry-After`. */
export class RateLimitError extends APIError {
  override name = 'RateLimitError';

  /** Seconds the API asked us to wait before retrying, if it said. */
  get retryAfter(): number | undefined {
    const value = Number(this.headers.get('retry-after'));
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }
}

/** 5xx — a fault on Bulkit's side or an unreachable dependency. */
export class InternalServerError extends APIError {
  override name = 'InternalServerError';
}

/** The request never got an HTTP response (DNS, TLS, connection reset, …). */
export class APIConnectionError extends BulkitError {
  override name = 'APIConnectionError';

  constructor(message = 'Connection error.', options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** The request exceeded the configured `timeout`. */
export class APIConnectionTimeoutError extends APIConnectionError {
  override name = 'APIConnectionTimeoutError';

  constructor(message = 'Request timed out.') {
    super(message);
  }
}

/** The caller aborted the request through its `AbortSignal`. */
export class APIUserAbortError extends BulkitError {
  override name = 'APIUserAbortError';

  constructor(message = 'Request was aborted.') {
    super(message);
  }
}

/** A webhook delivery failed signature or timestamp verification. Respond 400 and drop it. */
export class WebhookVerificationError extends BulkitError {
  override name = 'WebhookVerificationError';
}

function errorClassFor(status: number): typeof APIError {
  switch (status) {
    case 400:
      return BadRequestError;
    case 401:
      return AuthenticationError;
    case 402:
      return QuotaExceededError;
    case 403:
      return PermissionDeniedError;
    case 404:
      return NotFoundError;
    case 409:
      return ConflictError;
    case 413:
      return PayloadTooLargeError;
    case 415:
      return UnsupportedMediaTypeError;
    case 422:
      return UnprocessableEntityError;
    case 429:
      return RateLimitError;
    default:
      return status >= 500 ? InternalServerError : APIError;
  }
}

function extractError(body: unknown): ErrorBody | undefined {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error: unknown }).error;
    if (error && typeof error === 'object' && 'code' in error) return error as ErrorBody;
  }
  return undefined;
}
