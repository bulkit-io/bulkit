import { vi } from 'vitest';
import { Bulkit, type ClientOptions } from '../src';

export interface Recorded {
  url: URL;
  method: string;
  headers: Headers;
  body: unknown;
  signal: AbortSignal | undefined;
}

type Responder = (req: Recorded) => Response | Promise<Response>;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function apiError(status: number, code: string, headers: Record<string, string> = {}) {
  return json(
    { error: { code, message: `${code} happened`, requestId: 'req_123' } },
    status,
    headers,
  );
}

/** A client whose `fetch` answers from `responders`, in order, and records every request. */
export function mockClient(responders: Responder[], options: ClientOptions = {}) {
  const requests: Recorded[] = [];
  const queue = [...responders];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const body = init?.body;
    const req: Recorded = {
      url: new URL(String(input)),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof body === 'string' ? JSON.parse(body) : body,
      signal: init?.signal ?? undefined,
    };
    requests.push(req);
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected request: ${req.method} ${req.url}`);
    return next(req);
  });
  const client = new Bulkit({
    apiKey: 'bk_test_abc',
    baseURL: 'https://api.test',
    fetch,
    ...options,
  });
  return { client, requests, fetch };
}
