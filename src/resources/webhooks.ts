import type { RequestOptions } from '../client';
import type { APIPromise } from '../core/api-promise';
import type { PagePromise } from '../core/pagination';
import { APIResource } from '../core/resource';
import { path } from '../core/utils';
import type {
  IssuedWebhookEndpoint,
  WebhookCreateParams,
  WebhookDelivery,
  WebhookDeliveryListParams,
  WebhookEndpoint,
  WebhookEvent,
  WebhookTestResult,
  WebhookUpdateParams,
} from '../types';
import { type HeadersLike, type VerifyWebhookOptions, verifyWebhook } from '../webhooks';

export class Webhooks extends APIResource {
  /**
   * Register an endpoint. The response carries the signing `secret` — store it now;
   * no other call returns it.
   */
  create(params: WebhookCreateParams, options?: RequestOptions): APIPromise<IssuedWebhookEndpoint> {
    return this._client.post('/webhooks', params, options);
  }

  retrieve(webhookId: string, options?: RequestOptions): APIPromise<WebhookEndpoint> {
    return this._client.get(path`/webhooks/${webhookId}`, undefined, options);
  }

  list(options?: RequestOptions): APIPromise<WebhookEndpoint[]> {
    return this._client.get('/webhooks', undefined, options);
  }

  /** Update an endpoint. Setting `enabled: true` also clears its failure streak. */
  update(
    webhookId: string,
    params: WebhookUpdateParams,
    options?: RequestOptions,
  ): APIPromise<WebhookEndpoint> {
    return this._client.put(path`/webhooks/${webhookId}`, params, options);
  }

  delete(webhookId: string, options?: RequestOptions): APIPromise<void> {
    return this._client.delete(path`/webhooks/${webhookId}`, options);
  }

  /** Every delivery attempt to this endpoint, newest first. */
  deliveries(
    webhookId: string,
    params?: WebhookDeliveryListParams,
    options?: RequestOptions,
  ): PagePromise<WebhookDelivery> {
    return this._client.getPage(path`/webhooks/${webhookId}/deliveries`, params, options);
  }

  /** Issue a new signing secret. The old one stops working immediately. */
  rollSecret(webhookId: string, options?: RequestOptions): APIPromise<IssuedWebhookEndpoint> {
    return this._client.post(path`/webhooks/${webhookId}/roll-secret`, undefined, options);
  }

  /** Send a signed `webhook.test` event now. Works with test keys, which emit no real events. */
  test(webhookId: string, options?: RequestOptions): APIPromise<WebhookTestResult> {
    return this._client.post(path`/webhooks/${webhookId}/test`, undefined, options);
  }

  /**
   * Verify a delivery's signature and parse it. Same as the standalone `verifyWebhook()`,
   * which needs no API key — prefer that in a receiver that makes no API calls.
   */
  unwrap(
    payload: string | Uint8Array,
    headers: HeadersLike,
    options: VerifyWebhookOptions,
  ): Promise<WebhookEvent> {
    return verifyWebhook(payload, headers, options);
  }
}
