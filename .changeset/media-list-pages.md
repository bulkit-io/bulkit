---
'bulkit': minor
---

**Breaking:** `media.list()` now returns a page instead of an array, because `GET /media` is paged. It takes `{ cursor?, limit? }` (new `MediaListParams` type) and works like `posts.list()`: await it for one page (`page.data`, `page.nextCursor`), or use `for await` to walk the whole library, newest first.

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
