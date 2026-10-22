import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  Bulkit,
  BulkitError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  QuotaExceededError,
  RateLimitError,
  UnprocessableEntityError,
} from '../src';
import { apiError, json, mockClient } from './helpers';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** Runs a request while fast-forwarding through retry back-off. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  const result = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const outcome = await result;
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

describe('configuration', () => {
  it('reads the API key and base URL from the environment', async () => {
    vi.stubEnv('BULKIT_API_KEY', 'bk_live_env');
    vi.stubEnv('BULKIT_BASE_URL', 'https://proxy.example/');
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json([]));
    const client = new Bulkit({ fetch });

    await client.tags.list();

    expect(fetch).toHaveBeenCalledWith('https://proxy.example/public/v1/tags', expect.anything());
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer bk_live_env');
    expect(client.isTestMode).toBe(false);
  });

  it('throws a helpful error without an API key', () => {
    vi.stubEnv('BULKIT_API_KEY', '');
    expect(() => new Bulkit()).toThrow(BulkitError);
  });

  it('detects test-mode keys', () => {
    expect(new Bulkit({ apiKey: 'bk_test_x' }).isTestMode).toBe(true);
  });
});

describe('requests', () => {
  it('sends JSON with an idempotency key on writes', async () => {
    const { client, requests } = mockClient([() => json({ id: 'pst_1' }, 201)]);
    const params = {
      intent: 'draft' as const,
      channels: [{ channelId: 'chn_x', blocks: [{ content: 'Hello' }] }],
    };

    await client.posts.create(params);

    const [req] = requests;
    expect(req?.method).toBe('POST');
    expect(req?.url.pathname).toBe('/public/v1/posts');
    expect(req?.headers.get('content-type')).toBe('application/json');
    expect(req?.headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(req?.body).toEqual(params);
  });

  it('uses a caller-supplied idempotency key', async () => {
    const { client, requests } = mockClient([() => json({ id: 'pst_1' })]);
    await client.posts.publish('pst_1', { idempotencyKey: 'my-key' });
    expect(requests[0]?.headers.get('idempotency-key')).toBe('my-key');
  });

  it('does not send an idempotency key on reads', async () => {
    const { client, requests } = mockClient([() => json({ id: 'pst_1' })]);
    await client.posts.retrieve('pst_1');
    expect(requests[0]?.headers.has('idempotency-key')).toBe(false);
  });

  it('encodes path parameters and serialises array query parameters', async () => {
    const emptyPage = () => json({ data: [], nextCursor: null, hasMore: false });
    const { client, requests } = mockClient([emptyPage, emptyPage]);

    await client.posts.comments.list('a/b', { channelId: 'chn 1' });
    await client.posts.list({ status: ['failed', 'draft'] });

    expect(requests[0]?.url.pathname).toBe('/public/v1/posts/a%2Fb/comments');
    expect(requests[0]?.url.searchParams.get('channelId')).toBe('chn 1');
    expect(requests[1]?.url.searchParams.getAll('status')).toEqual(['failed', 'draft']);
  });

  it('returns undefined for 204 responses', async () => {
    const { client } = mockClient([() => new Response(null, { status: 204 })]);
    await expect(client.posts.delete('pst_1')).resolves.toBeUndefined();
  });

  it('exposes response metadata through withResponse()', async () => {
    const { client } = mockClient([
      () =>
        json([], 200, {
          'x-request-id': 'req_abc',
          'x-ratelimit-limit': '600',
          'x-ratelimit-remaining': '599',
          'x-ratelimit-reset': '42',
        }),
    ]);
    const { data, requestId, rateLimit } = await client.channels.list().withResponse();
    expect(data).toEqual([]);
    expect(requestId).toBe('req_abc');
    expect(rateLimit).toEqual({ limit: 600, remaining: 599, reset: 42 });
  });
});

describe('errors', () => {
  it.each([
    [402, 'quota_exceeded', QuotaExceededError],
    [404, 'not_found', NotFoundError],
    [409, 'conflict', ConflictError],
    [422, 'content_too_long', UnprocessableEntityError],
  ])('maps %i to the right class', async (status, code, ErrorClass) => {
    const { client } = mockClient([() => apiError(status, code)]);
    const error = await client.posts.retrieve('pst_1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorClass);
    expect(error).toMatchObject({
      status,
      code,
      requestId: 'req_123',
      message: `${code} happened`,
    });
  });

  it('never retries a quota error', async () => {
    const { client, fetch } = mockClient([() => apiError(402, 'quota_exceeded')]);
    await expect(client.posts.create({ intent: 'now', channels: [] })).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('retries', () => {
  it('retries rate limits, honouring Retry-After, with the same idempotency key', async () => {
    const { client, requests } = mockClient([
      () => apiError(429, 'rate_limited', { 'retry-after': '3' }),
      () => apiError(503, 'service_unavailable'),
      () => json({ id: 'pst_1' }, 201),
    ]);

    const post = await settle(client.posts.create({ intent: 'draft', channels: [] }));

    expect(post).toEqual({ id: 'pst_1' });
    expect(requests).toHaveLength(3);
    const keys = new Set(requests.map((r) => r.headers.get('idempotency-key')));
    expect(keys.size).toBe(1);
  });

  it('gives up after maxRetries', async () => {
    const { client, fetch } = mockClient(
      [() => apiError(429, 'rate_limited'), () => apiError(429, 'rate_limited')],
      { maxRetries: 1 },
    );
    await expect(settle(client.tags.list())).rejects.toBeInstanceOf(RateLimitError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries a 500 on reads but not on writes', async () => {
    const read = mockClient([() => apiError(500, 'internal'), () => json([])]);
    await expect(settle(read.client.tags.list())).resolves.toEqual([]);

    const write = mockClient([() => apiError(500, 'internal')]);
    await expect(
      settle(write.client.posts.create({ intent: 'draft', channels: [] })),
    ).rejects.toBeInstanceOf(InternalServerError);
    expect(write.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries 409 only for request_in_progress', async () => {
    const { client, fetch } = mockClient([
      () => apiError(409, 'request_in_progress'),
      () => json({ id: 'pst_1' }),
    ]);
    await settle(client.posts.publish('pst_1'));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries connection errors', async () => {
    const { client } = mockClient(
      [
        () => {
          throw new TypeError('fetch failed');
        },
        () => {
          throw new TypeError('fetch failed');
        },
      ],
      { maxRetries: 1 },
    );
    await expect(settle(client.tags.list())).rejects.toBeInstanceOf(APIConnectionError);
  });

  it('raises a timeout error when the request takes too long', async () => {
    vi.useRealTimers();
    const hang = (req: { signal: AbortSignal | undefined }) =>
      new Promise<Response>((_, reject) => {
        req.signal?.addEventListener('abort', () => reject(req.signal?.reason));
      });
    const { client } = mockClient([hang], { timeout: 10, maxRetries: 0 });
    await expect(client.tags.list()).rejects.toBeInstanceOf(APIConnectionTimeoutError);
  });
});
