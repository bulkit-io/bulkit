import type { RequestOptions } from '../client';
import type { APIPromise } from '../core/api-promise';
import { APIResource } from '../core/resource';
import type { Tag } from '../types';

export class Tags extends APIResource {
  /** The workspace's own labels for submissions. Never published, unlike hashtags. */
  list(options?: RequestOptions): APIPromise<Tag[]> {
    return this._client.get('/tags', undefined, options);
  }
}
