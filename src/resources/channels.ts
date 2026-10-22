import type { RequestOptions } from '../client';
import type { APIPromise } from '../core/api-promise';
import { APIResource } from '../core/resource';
import { path } from '../core/utils';
import type { Channel, ChannelCapabilities, OptionChoices, OptionChoicesParams } from '../types';

export class Channels extends APIResource {
  /** Every channel this workspace can post to. Call this before composing a post. */
  list(options?: RequestOptions): APIPromise<Channel[]> {
    return this._client.get('/channels', undefined, options);
  }

  /** Account-level rules for one channel (privacy levels, required flair, …), read live from the platform. */
  capabilities(channelId: string, options?: RequestOptions): APIPromise<ChannelCapabilities> {
    return this._client.get(path`/channels/${channelId}/capabilities`, undefined, options);
  }

  /**
   * Search the values of a `search`-type option, such as Instagram's `location_id`.
   * Pass `q` to turn a name into values, or `value` to turn a stored value back into its label.
   */
  optionChoices(
    channelId: string,
    key: string,
    params?: OptionChoicesParams,
    options?: RequestOptions,
  ): APIPromise<OptionChoices> {
    return this._client.get(path`/channels/${channelId}/options/${key}/choices`, params, options);
  }
}
