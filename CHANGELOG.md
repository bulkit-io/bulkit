# bulkit

## 0.1.1

### Patch Changes

- `media.uploadMultipart` no longer fails at the last step when you pass your own `idempotencyKey`. The key is now split per step (`<key>:start` and `<key>:complete`), because the API holds a key to one route. Keep it under 246 characters so both fit.
  
  Updated the API types: `POST /media/uploads/{id}/complete` accepts an `Idempotency-Key`, so a retry after a timeout gets the media item back instead of a `404`.
- 45d2b85: README: explain what Bulkit is, how to sign up and how to get an API key.

## 0.1.0

### Minor Changes

- 2f3b5b1: Initial release of the Bulkit Node.js SDK.
