/**
 * Upload an image, then attach it to a draft.
 *
 *   BULKIT_API_KEY=bk_test_... npx tsx examples/upload-media.ts ./photo.jpg chn_123
 */
import { openAsBlob } from 'node:fs';
import { basename } from 'node:path';
import { Bulkit } from 'bulkit';

const [filePath, channelId] = process.argv.slice(2);
if (!filePath || !channelId) throw new Error('Usage: upload-media.ts <file> <channelId>');

const bulkit = new Bulkit();
const file = await openAsBlob(filePath, { type: 'image/jpeg' });

// Up to 100 MB in one request; for larger video, use `bulkit.media.uploadMultipart()`.
const media = await bulkit.media.upload(file, { fileName: basename(filePath) });

const draft = await bulkit.posts.create({
  intent: 'draft',
  channels: [{ channelId, blocks: [{ content: 'Look at this.', mediaIds: [media.id] }] }],
});
console.log(`Draft ${draft.id} with media ${media.id}`);
