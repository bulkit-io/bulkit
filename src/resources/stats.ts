import type { RequestOptions } from '../client';
import type { APIPromise } from '../core/api-promise';
import { APIResource } from '../core/resource';
import type { Stats as StatsData, StatsInsights, StatsInsightsParams, StatsParams } from '../types';

export class Stats extends APIResource {
  /** Analytics counted from the posts themselves. Can go down when posts are deleted. */
  retrieve(params: StatsParams, options?: RequestOptions): APIPromise<StatsData> {
    return this._client.get('/stats', params, options);
  }

  /** When, where and in what format the workspace's posts perform best. */
  insights(params: StatsInsightsParams, options?: RequestOptions): APIPromise<StatsInsights> {
    return this._client.get('/stats/insights', params, options);
  }
}
