import { describe, expect, it } from 'vitest';
import { signWebhookPayload, verifyWebhook, WebhookVerificationError } from '../src';

const secret = 'whsec_test_secret';
const body = JSON.stringify({
  id: 'evt_1',
  type: 'post.published',
  createdAt: '2026-08-04T09:30:00.000Z',
  data: { channelId: 'chn_x' },
});
const now = 1_755_432_000;
const clock = () => now * 1000;

describe('verifyWebhook', () => {
  it('accepts a correctly signed delivery', async () => {
    const signature = await signWebhookPayload(body, secret, now);
    const event = await verifyWebhook(
      body,
      { 'x-bulkit-signature': signature },
      { secret, now: clock },
    );
    expect(event.id).toBe('evt_1');
    expect(event.type).toBe('post.published');
  });

  it('accepts a Uint8Array body and fetch Headers', async () => {
    const signature = await signWebhookPayload(body, secret, now);
    const headers = new Headers({ 'X-Bulkit-Signature': signature });
    await expect(
      verifyWebhook(new TextEncoder().encode(body), headers, { secret, now: clock }),
    ).resolves.toMatchObject({ id: 'evt_1' });
  });

  it('rejects a tampered body', async () => {
    const signature = await signWebhookPayload(body, secret, now);
    await expect(
      verifyWebhook(
        body.replace('chn_x', 'chn_y'),
        { 'x-bulkit-signature': signature },
        { secret, now: clock },
      ),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it('rejects the wrong secret', async () => {
    const signature = await signWebhookPayload(body, 'whsec_other', now);
    await expect(
      verifyWebhook(body, { 'x-bulkit-signature': signature }, { secret, now: clock }),
    ).rejects.toThrow('signature does not match');
  });

  it('rejects a replayed (stale) delivery', async () => {
    const signature = await signWebhookPayload(body, secret, now - 301);
    await expect(
      verifyWebhook(body, { 'x-bulkit-signature': signature }, { secret, now: clock }),
    ).rejects.toThrow('tolerance');
  });

  it('rejects missing or malformed headers', async () => {
    await expect(verifyWebhook(body, {}, { secret })).rejects.toThrow('Missing');
    await expect(
      verifyWebhook(body, { 'x-bulkit-signature': 'garbage' }, { secret }),
    ).rejects.toThrow('Malformed');
  });
});
