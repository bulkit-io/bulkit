/**
 * A minimal webhook receiver using only node:http.
 *
 *   BULKIT_WEBHOOK_SECRET=whsec_... npx tsx examples/webhook-receiver.ts
 */
import { createServer } from 'node:http';
import { verifyWebhook, WebhookVerificationError } from 'bulkit';

const secret = process.env.BULKIT_WEBHOOK_SECRET;
if (!secret) throw new Error('Set BULKIT_WEBHOOK_SECRET');

const seen = new Set<string>(); // use a real store in production

createServer(async (req, res) => {
  // Verify against the RAW body, exactly as received.
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const rawBody = Buffer.concat(chunks);

  try {
    const event = await verifyWebhook(rawBody, req.headers, { secret });

    // Delivery is at-least-once: dedupe on the event id.
    if (!seen.has(event.id)) {
      seen.add(event.id);
      switch (event.type) {
        case 'post.published':
        case 'post.failed':
        case 'post.partially_failed':
          console.log(`${event.type} on ${event.data.channelId}: ${event.data.post.id}`);
          break;
        case 'channel.needs_reconnect':
          console.log(`Reconnect ${event.data.channel.id}: ${event.data.reason}`);
          break;
        default:
          console.log(`Unhandled ${event.type}`);
      }
    }
    // Answer 2xx quickly; do slow work afterwards.
    res.writeHead(200).end();
  } catch (error) {
    res.writeHead(error instanceof WebhookVerificationError ? 400 : 500).end();
  }
}).listen(3000, () => console.log('Listening on :3000'));
