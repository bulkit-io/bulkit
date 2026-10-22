/**
 * Walk every failed submission across all pages and retry it.
 *
 *   BULKIT_API_KEY=bk_test_... npx tsx examples/list-failed-posts.ts
 */
import { Bulkit } from 'bulkit';

const bulkit = new Bulkit();

for await (const post of bulkit.posts.list({ status: ['failed'] })) {
  const failed = post.channels.filter((channel) => channel.status === 'failed');
  console.log(`${post.id}: ${failed.length} channel(s) failed — retrying`);
  // Skips channels that already published, so this never double-posts.
  await bulkit.posts.publish(post.id);
}
