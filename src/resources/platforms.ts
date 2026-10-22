import type { RequestOptions } from '../client';
import type { APIPromise } from '../core/api-promise';
import { APIResource } from '../core/resource';
import type { Platform } from '../types';

export class Platforms extends APIResource {
  /**
   * Live per-platform rules: character counts, attachments, thread length, accepted
   * media types. Read these instead of hard-coding them — they change.
   */
  list(options?: RequestOptions): APIPromise<Platform[]> {
    return this._client.get('/platforms', undefined, options);
  }
}
