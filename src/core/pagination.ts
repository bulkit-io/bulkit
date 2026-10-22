import { APIPromise, type APIResponse } from './api-promise';

interface CursorPageBody<T> {
  data: T[];
  nextCursor: string | null;
}

type FetchPage<T> = (cursor: string | undefined) => Promise<APIResponse<CursorPageBody<T>>>;

/**
 * One page of a cursor-paginated list.
 *
 * Iterate it with `for await` to walk every item across every page, or page
 * manually with `hasNextPage()` / `getNextPage()`.
 */
export class CursorPage<T> implements AsyncIterable<T> {
  readonly data: T[];
  /** Opaque. Pass it back as `cursor`; never parse or construct one. */
  readonly nextCursor: string | null;
  readonly response: Response;
  readonly #fetchPage: FetchPage<T>;

  constructor(body: CursorPageBody<T>, response: Response, fetchPage: FetchPage<T>) {
    this.data = body.data;
    this.nextCursor = body.nextCursor;
    this.response = response;
    this.#fetchPage = fetchPage;
  }

  /** A null `nextCursor` — not an empty `data` — is the end of the list. */
  hasNextPage(): boolean {
    return this.nextCursor !== null;
  }

  async getNextPage(): Promise<CursorPage<T>> {
    if (this.nextCursor === null) {
      throw new Error('No next page; check `hasNextPage()` before calling `getNextPage()`.');
    }
    const { data, response } = await this.#fetchPage(this.nextCursor);
    return new CursorPage(data, response, this.#fetchPage);
  }

  /** Yields this page and every page after it. */
  async *iterPages(): AsyncGenerator<CursorPage<T>> {
    let page: CursorPage<T> = this;
    yield page;
    while (page.hasNextPage()) {
      page = await page.getNextPage();
      yield page;
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for await (const page of this.iterPages()) {
      yield* page.data;
    }
  }
}

/**
 * Resolves to the first `CursorPage`, and is also directly async-iterable over every item:
 *
 * ```ts
 * for await (const post of client.posts.list({ status: 'scheduled' })) { ... }
 * ```
 */
export class PagePromise<T> extends APIPromise<CursorPage<T>> implements AsyncIterable<T> {
  constructor(fetchPage: FetchPage<T>, firstCursor?: string) {
    super(
      fetchPage(firstCursor).then((res) => ({
        ...res,
        data: new CursorPage(res.data, res.response, fetchPage),
      })),
    );
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    const page = await this;
    yield* page;
  }
}
