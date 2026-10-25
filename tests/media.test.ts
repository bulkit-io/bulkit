import { describe, expect, it } from 'vitest';
import { json, mockClient } from './helpers';

describe('media.uploadMultipart', () => {
  function uploadResponders() {
    return [
      () => json({ id: 'upl_1', partSize: 5, partCount: 1 }, 201),
      () => json([{ partNumber: 1, url: 'https://bucket.test/part-1' }]),
      () => new Response(null, { status: 200 }),
      () => json({ id: 'med_1' }),
    ];
  }

  it('splits a caller key per step, so start and complete never share one', async () => {
    const { client, requests } = mockClient(uploadResponders());

    await client.media.uploadMultipart(
      new Blob(['hello'], { type: 'video/mp4' }),
      { fileName: 'clip.mp4' },
      { idempotencyKey: 'my-key' },
    );

    const [start, sign, put, complete] = requests;
    expect(start?.headers.get('idempotency-key')).toBe('my-key:start');
    expect(sign?.headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(put?.headers.has('idempotency-key')).toBe(false);
    expect(complete?.url.pathname).toMatch(/\/media\/uploads\/upl_1\/complete$/);
    expect(complete?.headers.get('idempotency-key')).toBe('my-key:complete');
  });

  it('sends a generated key on complete when the caller gives none', async () => {
    const { client, requests } = mockClient(uploadResponders());

    await client.media.uploadMultipart(new Blob(['hello'], { type: 'video/mp4' }), {
      fileName: 'clip.mp4',
    });

    expect(requests[3]?.headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
