/**
 * Friendly names for the API's schemas. Everything here is derived from
 * `spec/openapi.json` — regenerate with `pnpm generate`, never edit by hand.
 */
import type { components, operations } from './generated/openapi';

type Schemas = components['schemas'];
type QueryOf<K extends keyof operations> = NonNullable<operations[K]['parameters']['query']>;
/**
 * The spec declares some string query parameters with an empty schema, which generates
 * `unknown`. Narrow them back to `string` until the spec says so itself.
 */
type WithStrings<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: undefined extends T[P] ? string | undefined : string;
};

// Channels & platforms
export type Channel = Schemas['Channel'];
export type ChannelCapabilities = Schemas['ChannelCapabilities'];
export type OptionChoices = Schemas['OptionChoices'];
export type OptionChoicesParams = WithStrings<
  QueryOf<'PublicChannelsController_searchOptionChoices'>,
  'q' | 'value'
>;
export type Platform = Schemas['Platform'];
export type PlatformLimits = Schemas['PlatformLimits'];
export type PostType = Schemas['PostType'];

// Posts
export type Post = Schemas['Post'];
export type PostStatus = Post['status'];
export type PostChannel = Schemas['PostChannel'];
export type PostBlock = Schemas['PostBlock'];
export type Attachment = Schemas['Attachment'];
export type PostCreateParams = Schemas['CreatePostRequest'];
export type PostCreateChannel = Schemas['CreatePostChannel'];
export type PostCreateBlock = Schemas['CreatePostBlock'];
export type PostListParams = WithStrings<QueryOf<'PublicPostsController_list'>, 'cursor'>;
export type PostReviseParams = Schemas['RevisePostRequest'];
export type ReviseResult = Schemas['ReviseResult'];
export type RetractResult = Schemas['RetractResult'];
export type PostMetrics = Schemas['PostMetrics'];

// Comments
export type Comment = Schemas['Comment'];
export type CommentReply = Schemas['CommentReply'];
export type CommentListParams = WithStrings<
  QueryOf<'PublicPostsController_listComments'>,
  'channelId' | 'cursor'
>;
export type CommentReplyParams = Schemas['ReplyToCommentRequest'];

// Media
export type MediaItem = Schemas['MediaItem'];
export type MediaUpload = Schemas['MediaUpload'];
export type MediaUploadPart = Schemas['MediaUploadPart'];
export type MediaUploadStartParams = Schemas['StartMediaUploadRequest'];

// Tags, stats, usage
export type Tag = Schemas['Tag'];
export type Stats = Schemas['Stats'];
export type StatsParams = QueryOf<'PublicStatsController_get'>;
export type StatsInsights = Schemas['StatsInsights'];
export type StatsInsightsParams = QueryOf<'PublicStatsController_insights'>;
export type Usage = Schemas['Usage'];
export type UsageMetric = Schemas['UsageMetric'];

// Webhooks
export type WebhookEndpoint = Schemas['WebhookEndpoint'];
export type IssuedWebhookEndpoint = Schemas['IssuedWebhookEndpoint'];
export type WebhookCreateParams = Schemas['CreateWebhookRequest'];
export type WebhookUpdateParams = Schemas['UpdateWebhookRequest'];
export type WebhookDelivery = Schemas['WebhookDelivery'];
export type WebhookDeliveryListParams = WithStrings<
  QueryOf<'PublicWebhooksController_deliveries'>,
  'cursor'
>;
export type WebhookTestResult = Schemas['WebhookTestResult'];
export type WebhookEventType = Schemas['WebhookEvent']['type'];
export type WebhookPostData = Schemas['WebhookPostData'];
export type WebhookChannelData = Schemas['WebhookChannelData'];

interface WebhookEventBase<Type extends string, Data> {
  /** Stable across every redelivery. Dedupe on it: delivery is at-least-once. */
  id: string;
  type: Type;
  /** When the fact became true — not when this attempt was sent. */
  createdAt: string;
  data: Data;
}

/** A verified webhook delivery, discriminated on `type`. */
export type WebhookEvent =
  | WebhookEventBase<'post.published' | 'post.failed' | 'post.partially_failed', WebhookPostData>
  | WebhookEventBase<'channel.needs_reconnect', WebhookChannelData>
  | WebhookEventBase<'webhook.test', unknown>;
