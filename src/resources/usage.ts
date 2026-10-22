import type { RequestOptions } from '../client';
import type { APIPromise } from '../core/api-promise';
import { APIResource } from '../core/resource';
import type { Usage as UsageData } from '../types';

export class Usage extends APIResource {
  /**
   * The billing meter for the current period. The only endpoint that predicts a
   * `QuotaExceededError` — do not use `stats` for that.
   */
  retrieve(options?: RequestOptions): APIPromise<UsageData> {
    return this._client.get('/usage', undefined, options);
  }
}
