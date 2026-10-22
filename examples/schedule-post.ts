/**
 * Schedule one submission to every connected channel.
 *
 *   BULKIT_API_KEY=bk_test_... npx tsx examples/schedule-post.ts
 */
import { Bulkit, UnprocessableEntityError } from 'bulkit';

const bulkit = new Bulkit();

const [channels, platforms] = await Promise.all([bulkit.channels.list(), bulkit.platforms.list()]);
console.log(`Posting to ${channels.length} channel(s) across ${platforms.length} platform(s).`);

try {
  // ONE call, several channels — never one call per channel.
  const post = await bulkit.posts.create({
    intent: 'schedule',
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    channels: channels.map((channel) => ({
      channelId: channel.id,
      blocks: [{ content: 'Shipping today.' }],
    })),
  });
  console.log(`Scheduled ${post.id} (${post.status}).`);
} catch (error) {
  if (error instanceof UnprocessableEntityError) {
    // A platform rule refused it; `field` points at the offending part of the body.
    console.error(`${error.code} at ${error.field}: ${error.message}`);
  } else {
    throw error;
  }
}
