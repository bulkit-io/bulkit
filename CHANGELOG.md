# bulkit

## 0.2.0

### Minor Changes

- fca067d: **Breaking:** `media.list()` now returns a page instead of an array, because `GET /media` is paged. It takes `{ cursor?, limit? }` (new `MediaListParams` type) and works like `posts.list()`: await it for one page (`page.data`, `page.nextCursor`), or use `for await` to walk the whole library, newest first.
  
  ```ts
  // before
  const items = await bulkit.media.list();
  // after
  for await (const item of bulkit.media.list()) { ... }
  ```
  
  List methods now throw a `BulkitError` if the server answers with something other than a page (for example, an older API that still returns a bare array for `GET /media`), instead of re-requesting the first page forever.
  
  Updated the API types from the latest spec:
  
  - New `MediaPage` schema for `GET /media`.
  - `ChannelCapabilities.postingPaused` (from `channels.capabilities(id)`): why a channel can't publish right now (such as a TikTok posting cap), or `null`. Don't publish to a channel while it is set; the platform refuses the post.
  - `Usage.posts.included`: how many published actions the plan includes this billing period, or `null` when nothing is metered. Actions past it are billed per action, not refused.

## 0.1.1

### Patch Changes

- `media.uploadMultipart` no longer fails at the last step when you pass your own `idempotencyKey`. The key is now split per step (`<key>:start` and `<key>:complete`), because the API holds a key to one route. Keep it under 246 characters so both fit.
  
  Updated the API types: `POST /media/uploads/{id}/complete` accepts an `Idempotency-Key`, so a retry after a timeout gets the media item back instead of a `404`.
- 45d2b85: README: explain what Bulkit is, how to sign up and how to get an API key.

## 0.1.0

### Minor Changes

- 2f3b5b1: Initial release of the Bulkit Node.js SDK.
