# Bulkit Node.js SDK

[![npm](https://img.shields.io/npm/v/bulkit.svg)](https://www.npmjs.com/package/bulkit)
[![CI](https://github.com/bulkit-io/bulkit/actions/workflows/ci.yml/badge.svg)](https://github.com/bulkit-io/bulkit/actions/workflows/ci.yml)

The official TypeScript / JavaScript library for the [Bulkit](https://bulkit.io) API: schedule
and publish social media posts from your own code.

- Fully typed, generated from the Bulkit OpenAPI spec
- Zero runtime dependencies, ESM and CommonJS
- Retries with backoff, timeouts, and automatic idempotency keys on every write
- Cursor pagination with `for await`
- Webhook signature verification

## Installation

```sh
npm install bulkit
# or: pnpm add bulkit / yarn add bulkit / bun add bulkit
```

Requires Node.js 22 or later. Other runtimes with `fetch` and Web Crypto (Bun, Deno, Cloudflare
Workers) should also work.

## Usage

```ts
import { Bulkit } from 'bulkit';

const bulkit = new Bulkit({
  apiKey: process.env.BULKIT_API_KEY, // this is the default and can be omitted
});

// 1. What can I post to, and what will each platform accept?
const channels = await bulkit.channels.list();
const platforms = await bulkit.platforms.list();

// 2. Schedule one submission to several channels.
const post = await bulkit.posts.create({
  intent: 'schedule',
  scheduledAt: '2026-11-01T09:00:00Z',
  channels: [
    { channelId: 'chn_x', blocks: [{ content: 'Shipping today.' }] },
    { channelId: 'chn_li', blocks: [{ content: 'A longer version, for LinkedIn.' }] },
  ],
});

console.log(post.id, post.status); // "scheduled"
```

> Call `posts.create` **once** with several entries in `channels`. Calling it once per channel
> creates several unrelated submissions, each with its own id and schedule.

### Test mode

A `bk_test_…` key validates and stores exactly like a live key, but publishes nothing and bills
nothing. `bulkit.isTestMode` tells you which kind of key a client holds.

## Publishing is asynchronous

`intent: 'now'` and `posts.publish()` return as soon as the work is queued, with status
`publishing`. That does not mean the post is live. Each channel publishes on its own, so a
submission can end up `partially_published`. Find out what happened through
[webhooks](#webhooks) (preferred) or by calling `posts.retrieve(id)`.

## Pagination

List methods return a page you can `await`, or iterate directly to get every item across every
page:

```ts
for await (const post of bulkit.posts.list({ status: ['failed'] })) {
  await bulkit.posts.publish(post.id); // retries; already-published channels are skipped
}

// Or page by hand:
let page = await bulkit.posts.list({ limit: 50 });
while (page.hasNextPage()) {
  page = await page.getNextPage();
}
```

## Media

```ts
import { openAsBlob } from 'node:fs';

const image = await bulkit.media.upload(await openAsBlob('photo.jpg', { type: 'image/jpeg' }), {
  fileName: 'photo.jpg',
});

// Large video goes through a resumable upload session; the SDK handles the parts.
const video = await bulkit.media.uploadMultipart(await openAsBlob('launch.mp4'), {
  fileName: 'launch.mp4',
  mimeType: 'video/mp4',
});
```

## Webhooks

Verify every delivery against the **raw** request body. Re-serialized JSON will not match the
signature.

```ts
import express from 'express';
import { verifyWebhook, WebhookVerificationError } from 'bulkit';

app.post('/webhooks/bulkit', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const event = await verifyWebhook(req.body, req.headers, {
      secret: process.env.BULKIT_WEBHOOK_SECRET!,
    });
    if (event.type === 'post.failed') {
      console.log(event.data.channelId, event.data.error);
    }
    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(err instanceof WebhookVerificationError ? 400 : 500);
  }
});
```

Delivery is at-least-once, so dedupe on `event.id`. Test a receiver with
`bulkit.webhooks.test(endpointId)`, which works with test keys too.

## Error handling

Every API failure throws a subclass of `APIError`. Branch on `code` rather than `message`:

```ts
import { APIError, QuotaExceededError, RateLimitError } from 'bulkit';

try {
  await bulkit.posts.create(params);
} catch (err) {
  if (err instanceof QuotaExceededError) {
    // The plan's allowance is spent. Retrying will not help; see bulkit.usage.retrieve().
  } else if (err instanceof APIError) {
    console.error(err.status, err.code, err.field, err.requestId);
  } else {
    throw err;
  }
}
```

| Status | Error                                              |
| ------ | -------------------------------------------------- |
| 400    | `BadRequestError`                                  |
| 401    | `AuthenticationError`                              |
| 402    | `QuotaExceededError`                               |
| 403    | `PermissionDeniedError`                            |
| 404    | `NotFoundError`                                    |
| 409    | `ConflictError`                                    |
| 413    | `PayloadTooLargeError`                             |
| 415    | `UnsupportedMediaTypeError`                        |
| 422    | `UnprocessableEntityError`                         |
| 429    | `RateLimitError`                                   |
| 5xx    | `InternalServerError`                              |
| none   | `APIConnectionError` / `APIConnectionTimeoutError` |

All of them extend `BulkitError`.

## Retries and idempotency

Every `POST` and `PUT` is sent with an `Idempotency-Key`. The SDK generates one per call and
reuses it across its own retries, so a retried write can never publish twice. Pass your own
key to keep retries safe across process restarts:

```ts
await bulkit.posts.create(params, { idempotencyKey: `campaign-${campaignId}` });
```

These failures are retried twice by default, with exponential backoff that honours
`Retry-After`:
- connection errors and timeouts
- `408`, `429`, `502`, `503` and `504`
- `409 request_in_progress`
- `500`, on reads only

A `500` on a write is not retried, because the API replays the same failure for the same key.
`402` and other `4xx` errors are never retried.

```ts
const bulkit = new Bulkit({ maxRetries: 5, timeout: 20_000 }); // client-wide
await bulkit.posts.list({}, { maxRetries: 0, signal: AbortSignal.timeout(5_000) }); // per call
```

## Response metadata

```ts
const { data, requestId, rateLimit, response } = await bulkit.channels.list().withResponse();
console.log(rateLimit.remaining, requestId);
```

Include the `requestId` (also on every `APIError`) when you contact support.

## Configuration

| Option                    | Default                                                     |
| ------------------------- | ----------------------------------------------------------- |
| `apiKey`                  | `process.env.BULKIT_API_KEY`                                |
| `baseURL`                 | `process.env.BULKIT_BASE_URL`, then `https://api.bulkit.io` |
| `timeout`                 | `60000` ms per attempt                                      |
| `maxRetries`              | `2`                                                         |
| `defaultHeaders`          | `{}`                                                        |
| `fetch`                   | `globalThis.fetch`                                          |
| `dangerouslyAllowBrowser` | `false`                                                     |

Your API key is a secret. The client refuses to run in a browser unless you opt in with
`dangerouslyAllowBrowser`.

## Versioning

This package follows [SemVer](https://semver.org). The API version (`/public/v1`) is fixed per
major version of the SDK.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
