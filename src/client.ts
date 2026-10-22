import { APIPromise, type APIResponse, rateLimitFrom } from './core/api-promise';
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  BulkitError,
  RateLimitError,
} from './core/errors';
import { PagePromise } from './core/pagination';
import { buildQuery, isBrowser, type Query, readEnv, sleep, uuid } from './core/utils';
import { Channels } from './resources/channels';
import { Media } from './resources/media';
import { Platforms } from './resources/platforms';
import { Posts } from './resources/posts';
import { Stats } from './resources/stats';
import { Tags } from './resources/tags';
import { Usage } from './resources/usage';
import { Webhooks } from './resources/webhooks';
import { VERSION } from './version';

const DEFAULT_BASE_URL = 'https://api.bulkit.io';
const API_PREFIX = '/public/v1';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8_000;

export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** Your API key (`bk_live_…` or `bk_test_…`). Defaults to `process.env.BULKIT_API_KEY`. */
  apiKey?: string | undefined;
  /**
   * Scheme and host to send requests to. Only change this to route through a proxy or a mock
   * server. Defaults to `process.env.BULKIT_BASE_URL`, then `https://api.bulkit.io`.
   */
  baseURL?: string | undefined;
  /** Per-attempt timeout in milliseconds. Default 60 000. */
  timeout?: number | undefined;
  /** How many times to retry a retryable failure. Default 2. */
  maxRetries?: number | undefined;
  /** Headers sent with every request. */
  defaultHeaders?: Record<string, string> | undefined;
  /** A `fetch` implementation to use instead of the global one (proxies, testing, …). */
  fetch?: Fetch | undefined;
  /**
   * Your API key is a secret: shipping it to a browser hands it to every visitor.
   * Set this only if you understand that, e.g. for an internal tool.
   */
  dangerouslyAllowBrowser?: boolean | undefined;
}

export interface RequestOptions {
  /**
   * Sent as `Idempotency-Key` on writes. The SDK generates one per call by default and
   * reuses it across its own retries; pass your own to make retries safe across processes.
   */
  idempotencyKey?: string | undefined;
  timeout?: number | undefined;
  maxRetries?: number | undefined;
  signal?: AbortSignal | undefined;
  headers?: Record<string, string> | undefined;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface FinalRequest extends RequestOptions {
  method: Method;
  path: string;
  query?: Query | undefined;
  body?: unknown;
}

/**
 * The Bulkit API client.
 *
 * ```ts
 * import { Bulkit } from 'bulkit';
 *
 * const bulkit = new Bulkit(); // reads BULKIT_API_KEY
 * const channels = await bulkit.channels.list();
 * ```
 */
export class Bulkit {
  readonly channels: Channels = new Channels(this);
  readonly platforms: Platforms = new Platforms(this);
  readonly posts: Posts = new Posts(this);
  readonly media: Media = new Media(this);
  readonly tags: Tags = new Tags(this);
  readonly stats: Stats = new Stats(this);
  readonly usage: Usage = new Usage(this);
  readonly webhooks: Webhooks = new Webhooks(this);

  readonly baseURL: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly #apiKey: string;
  readonly #fetch: Fetch;
  readonly #defaultHeaders: Record<string, string>;

  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnv('BULKIT_API_KEY');
    if (!apiKey) {
      throw new BulkitError(
        'Missing API key. Pass `apiKey` to `new Bulkit()` or set the BULKIT_API_KEY environment variable.',
      );
    }
    if (isBrowser() && !options.dangerouslyAllowBrowser) {
      throw new BulkitError(
        'Running in a browser would expose your secret API key to every visitor. ' +
          'Call Bulkit from your server instead, or pass `dangerouslyAllowBrowser: true` if you understand the risk.',
      );
    }

    const baseURL = options.baseURL ?? readEnv('BULKIT_BASE_URL') ?? DEFAULT_BASE_URL;
    this.baseURL = baseURL.replace(/\/+$/, '');
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.#apiKey = apiKey;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#defaultHeaders = options.defaultHeaders ?? {};
  }

  /** `true` for a `bk_test_…` key: validates like live, but publishes nothing and bills nothing. */
  get isTestMode(): boolean {
    return this.#apiKey.startsWith('bk_test_');
  }

  get<T>(path: string, query?: Query, options?: RequestOptions): APIPromise<T> {
    return this.request({ method: 'GET', path, query, ...options });
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): APIPromise<T> {
    return this.request({ method: 'POST', path, body, ...options });
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): APIPromise<T> {
    return this.request({ method: 'PUT', path, body, ...options });
  }

  delete<T = void>(path: string, options?: RequestOptions): APIPromise<T> {
    return this.request({ method: 'DELETE', path, ...options });
  }

  /** @internal */
  getPage<T>(path: string, query: Query | undefined, options?: RequestOptions): PagePromise<T> {
    return new PagePromise<T>((cursor) =>
      this.request<{ data: T[]; nextCursor: string | null }>({
        method: 'GET',
        path,
        query: cursor ? { ...query, cursor } : query,
        ...options,
      }).withResponse(),
    );
  }

  /** @internal Fetch a non-API URL (e.g. a presigned upload URL) without credentials. */
  fetchExternal(url: string, init: RequestInit): Promise<Response> {
    return this.#fetch(url, init);
  }

  /** Sends a request, retrying what is safe to retry. Prefer the resource methods. */
  request<T>(req: FinalRequest): APIPromise<T> {
    return new APIPromise(this.#send<T>(req));
  }

  async #send<T>(req: FinalRequest): Promise<APIResponse<T>> {
    const maxRetries = req.maxRetries ?? this.maxRetries;
    const isWrite = req.method === 'POST' || req.method === 'PUT';
    // One key per logical call, reused across retries — that is what makes a retry safe.
    const idempotencyKey = isWrite ? (req.idempotencyKey ?? uuid()) : undefined;
    const url = this.baseURL + API_PREFIX + req.path + buildQuery(req.query);

    for (let attempt = 0; ; attempt++) {
      const retriesLeft = maxRetries - attempt;
      let response: Response;
      try {
        response = await this.#fetchWithTimeout(url, req, idempotencyKey);
      } catch (error) {
        if (error instanceof APIUserAbortError || retriesLeft <= 0) throw error;
        await sleep(retryDelay(attempt));
        continue;
      }

      if (response.ok) {
        return {
          data: await parseBody<T>(response),
          response,
          requestId: response.headers.get('x-request-id'),
          rateLimit: rateLimitFrom(response.headers),
        };
      }

      const body = await parseBody<unknown>(response).catch(() => undefined);
      const error = APIError.from(response.status, body, response.headers);
      if (retriesLeft <= 0 || !shouldRetry(error, req.method)) throw error;
      await sleep(retryDelay(attempt, error));
    }
  }

  async #fetchWithTimeout(
    url: string,
    req: FinalRequest,
    idempotencyKey: string | undefined,
  ): Promise<Response> {
    const timeout = req.timeout ?? this.timeout;
    const timeoutSignal = AbortSignal.timeout(timeout);
    const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal;

    const isForm = req.body instanceof FormData;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': `bulkit-node/${VERSION}`,
      ...this.#defaultHeaders,
      ...req.headers,
      Authorization: `Bearer ${this.#apiKey}`,
    };
    if (req.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    try {
      return await this.#fetch(url, {
        method: req.method,
        headers,
        body:
          req.body === undefined
            ? undefined
            : isForm
              ? (req.body as FormData)
              : JSON.stringify(req.body),
        signal,
      });
    } catch (error) {
      if (req.signal?.aborted) throw new APIUserAbortError();
      if (timeoutSignal.aborted) throw new APIConnectionTimeoutError();
      throw new APIConnectionError(undefined, { cause: error });
    }
  }
}

/**
 * What is worth retrying, per the API's contract:
 * - 429 and 409 `request_in_progress`: transient by definition.
 * - 408, 502, 503, 504: the request was not (fully) attempted.
 * - 500: only on reads. A write's idempotency key is kept on a 500, so retrying it
 *   would only replay the same failure; the caller must inspect state first.
 * - 402 `quota_exceeded` and every other 4xx: retrying can never succeed.
 */
function shouldRetry(error: APIError, method: Method): boolean {
  const { status } = error;
  if (status === 429 || status === 408 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  if (status === 409) return error.code === 'request_in_progress';
  if (status === 500) return method === 'GET' || method === 'DELETE';
  return false;
}

function retryDelay(attempt: number, error?: APIError): number {
  if (error instanceof RateLimitError && error.retryAfter !== undefined) {
    return Math.min(error.retryAfter * 1000, 60_000);
  }
  const backoff = Math.min(INITIAL_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
  // Jitter between 75% and 100% of the backoff, so clients do not retry in lockstep.
  return backoff * (0.75 + Math.random() * 0.25);
}

async function parseBody<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  const type = response.headers.get('content-type') ?? '';
  return (type.includes('json') ? JSON.parse(text) : text) as T;
}
