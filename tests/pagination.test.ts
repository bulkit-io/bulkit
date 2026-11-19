import { describe, expect, it } from 'vitest';
import { BulkitError, CursorPage } from '../src';
import { json, mockClient } from './helpers';

const page = (ids: string[], nextCursor: string | null) =>
  json({ data: ids.map((id) => ({ id })), nextCursor, hasMore: nextCursor !== null });

describe('cursor pagination', () => {
  it('awaits to the first page', async () => {
    const { client } = mockClient([() => page(['a', 'b'], 'cur_2')]);
    const first = await client.posts.list({ limit: 2 });
    expect(first).toBeInstanceOf(CursorPage);
    expect(first.data.map((p) => p.id)).toEqual(['a', 'b']);
    expect(first.hasNextPage()).toBe(true);
  });

  it('iterates every item across pages, stopping on a null cursor', async () => {
    const { client, requests } = mockClient([
      () => page(['a', 'b'], 'cur_2'),
      () => page([], 'cur_3'), // an empty page is NOT the end
      () => page(['c'], null),
    ]);

    const ids: string[] = [];
    for await (const post of client.posts.list({ limit: 2 })) ids.push(post.id);

    expect(ids).toEqual(['a', 'b', 'c']);
    expect(requests.map((r) => r.url.searchParams.get('cursor'))).toEqual([null, 'cur_2', 'cur_3']);
    expect(requests.every((r) => r.url.searchParams.get('limit') === '2')).toBe(true);
  });

  it('pages the media library the same way', async () => {
    const { client, requests } = mockClient([
      () => page(['m1', 'm2'], 'cur_2'),
      () => page(['m3'], null),
    ]);

    const ids: string[] = [];
    for await (const item of client.media.list({ limit: 2 })) ids.push(item.id);

    expect(ids).toEqual(['m1', 'm2', 'm3']);
    expect(requests.every((r) => r.url.pathname.endsWith('/media'))).toBe(true);
    expect(requests.map((r) => r.url.searchParams.get('cursor'))).toEqual([null, 'cur_2']);
    expect(requests.every((r) => r.url.searchParams.get('limit') === '2')).toBe(true);
  });

  it('awaits media.list() to a single page', async () => {
    const { client, requests } = mockClient([() => page(['m1', 'm2'], 'cur_2')]);
    const first = await client.media.list({ limit: 2 });
    expect(first).toBeInstanceOf(CursorPage);
    expect(first.data.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(first.nextCursor).toBe('cur_2');
    expect(first.hasNextPage()).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it('rejects a response that is not a page instead of looping', async () => {
    // An API that predates paged GET /media answers with a bare array.
    const bare = () => json([{ id: 'm1' }]);
    const { client, requests } = mockClient([bare, bare]);
    await expect(client.media.list()).rejects.toThrow(BulkitError);

    const iterate = async () => {
      for await (const _ of client.media.list()) void _;
    };
    await expect(iterate()).rejects.toThrow(/paged response/);
    expect(requests).toHaveLength(2); // one per call, no re-fetching
  });

  it('treats a missing nextCursor as the last page', async () => {
    const { client } = mockClient([() => json({ data: [{ id: 'm1' }] })]);
    const first = await client.media.list();
    expect(first.nextCursor).toBeNull();
    expect(first.hasNextPage()).toBe(false);
  });

  it('pages manually', async () => {
    const { client } = mockClient([() => page(['a'], 'cur_2'), () => page(['b'], null)]);
    const first = await client.webhooks.deliveries('whk_1');
    const second = await first.getNextPage();
    expect(second.data.map((d) => d.id)).toEqual(['b']);
    expect(second.hasNextPage()).toBe(false);
    await expect(second.getNextPage()).rejects.toThrow();
  });
});
