import { describe, expect, it } from 'vitest';
import { CursorPage } from '../src';
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

  it('pages manually', async () => {
    const { client } = mockClient([() => page(['a'], 'cur_2'), () => page(['b'], null)]);
    const first = await client.webhooks.deliveries('whk_1');
    const second = await first.getNextPage();
    expect(second.data.map((d) => d.id)).toEqual(['b']);
    expect(second.hasNextPage()).toBe(false);
    await expect(second.getNextPage()).rejects.toThrow();
  });
});
