export interface APIResponse<T> {
  data: T;
  response: Response;
  /** The `x-request-id` of the response. Quote it when contacting support. */
  requestId: string | null;
  /** Requests per minute allowed for this key, from `X-RateLimit-*` headers. */
  rateLimit: RateLimitInfo;
}

export interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  /** Seconds until the window refills. */
  reset: number | null;
}

/**
 * A `Promise` of the parsed response body that can also hand back the raw `Response`:
 *
 * ```ts
 * const post = await client.posts.retrieve('pst_123');
 * const { data, requestId, rateLimit } = await client.posts.retrieve('pst_123').withResponse();
 * ```
 */
export class APIPromise<T> extends Promise<T> {
  readonly #responsePromise: Promise<APIResponse<T>>;

  constructor(responsePromise: Promise<APIResponse<T>>) {
    // `Promise` subclasses must accept an executor; resolution is driven by `responsePromise`.
    super((resolve) => resolve(null as T));
    this.#responsePromise = responsePromise;
  }

  /** Resolves to the body together with the raw response and its metadata. */
  withResponse(): Promise<APIResponse<T>> {
    return this.#responsePromise;
  }

  #parsed?: Promise<T>;
  #parse(): Promise<T> {
    this.#parsed ??= this.#responsePromise.then((r) => r.data);
    return this.#parsed;
  }

  // biome-ignore lint/suspicious/noThenProperty: an APIPromise is deliberately a thenable.
  override then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.#parse().then(onfulfilled, onrejected);
  }

  override catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T | TResult> {
    return this.#parse().catch(onrejected);
  }

  override finally(onfinally?: (() => void) | null): Promise<T> {
    return this.#parse().finally(onfinally);
  }

  // Derived promises (from `.then`) should be plain Promises, not APIPromises.
  static override get [Symbol.species]() {
    return Promise;
  }
}

export function rateLimitFrom(headers: Headers): RateLimitInfo {
  const num = (name: string) => {
    const raw = headers.get(name);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return {
    limit: num('x-ratelimit-limit'),
    remaining: num('x-ratelimit-remaining'),
    reset: num('x-ratelimit-reset'),
  };
}
