import type { RequestOptions } from '../client';
import type { APIPromise } from '../core/api-promise';
import type { PagePromise } from '../core/pagination';
import { APIResource } from '../core/resource';
import { path } from '../core/utils';
import type {
  Comment,
  CommentListParams,
  CommentReply,
  CommentReplyParams,
  Post,
  PostCreateParams,
  PostListParams,
  PostMetrics,
  PostReviseParams,
  RetractResult,
  ReviseResult,
} from '../types';

export class Posts extends APIResource {
  readonly comments: Comments = new Comments(this._client);

  /**
   * Create one submission targeting one or more channels.
   *
   * Call this ONCE with several `channels`, not once per channel. With `intent: 'now'`
   * it returns as soon as the work is queued (`status: 'publishing'`); the outcome
   * arrives later via webhooks or `retrieve()`.
   */
  create(params: PostCreateParams, options?: RequestOptions): APIPromise<Post> {
    return this._client.post('/posts', params, options);
  }

  retrieve(postId: string, options?: RequestOptions): APIPromise<Post> {
    return this._client.get(path`/posts/${postId}`, undefined, options);
  }

  /**
   * Submissions, newest first. Await it for one page, or iterate it for every post:
   *
   * ```ts
   * for await (const post of bulkit.posts.list({ status: 'failed' })) { ... }
   * ```
   */
  list(params?: PostListParams, options?: RequestOptions): PagePromise<Post> {
    return this._client.getPage('/posts', params, options);
  }

  /** Replace an unpublished submission. Once it has published, use `revise()`. */
  update(postId: string, params: PostCreateParams, options?: RequestOptions): APIPromise<Post> {
    return this._client.put(path`/posts/${postId}`, params, options);
  }

  /**
   * Remove Bulkit's record of a submission. Published copies stay LIVE on the
   * platforms — use `retract()` to take them down.
   */
  delete(postId: string, options?: RequestOptions): APIPromise<void> {
    return this._client.delete(path`/posts/${postId}`, options);
  }

  /**
   * Publish now, or retry a failed / partially published submission. Channels that
   * already published are skipped. Asynchronous, like `intent: 'now'`.
   */
  publish(postId: string, options?: RequestOptions): APIPromise<Post> {
    return this._client.post(path`/posts/${postId}/publish`, undefined, options);
  }

  /**
   * PERMANENTLY delete the published copies from their platforms, with their likes and
   * replies. Not every channel can be retracted: always read `remaining`.
   */
  retract(postId: string, options?: RequestOptions): APIPromise<RetractResult> {
    return this._client.post(path`/posts/${postId}/retract`, undefined, options);
  }

  /** Rewrite live copy in place, where the platform allows it (`limits.remoteEdit`). */
  revise(
    postId: string,
    params: PostReviseParams,
    options?: RequestOptions,
  ): APIPromise<ReviseResult> {
    return this._client.post(path`/posts/${postId}/revise`, params, options);
  }

  metrics(postId: string, options?: RequestOptions): APIPromise<PostMetrics> {
    return this._client.get(path`/posts/${postId}/metrics`, undefined, options);
  }
}

export class Comments extends APIResource {
  /** Comments on one channel's copy of a post, read live from the platform. */
  list(postId: string, params: CommentListParams, options?: RequestOptions): PagePromise<Comment> {
    return this._client.getPage(path`/posts/${postId}/comments`, params, options);
  }

  /** Reply publicly to a comment. The reply is visible the moment this returns. */
  reply(
    postId: string,
    commentId: string,
    params: CommentReplyParams,
    options?: RequestOptions,
  ): APIPromise<CommentReply> {
    return this._client.post(path`/posts/${postId}/comments/${commentId}/replies`, params, options);
  }
}
