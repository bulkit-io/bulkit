import { WebhookVerificationError } from './core/errors';
import type { WebhookEvent } from './types';

export const SIGNATURE_HEADER = 'x-bulkit-signature';
const DEFAULT_TOLERANCE_SECONDS = 300;

/** Fetch `Headers`, or the plain object Node / Express / Fastify give you. */
export type HeadersLike = Headers | Record<string, string | string[] | undefined>;

export interface VerifyWebhookOptions {
  /** The endpoint's signing secret (`whsec_…`), returned when it was created or rolled. */
  secret: string;
  /** Reject deliveries signed more than this many seconds from now. Default 300. */
  toleranceSeconds?: number | undefined;
  /** @internal For tests. */
  now?: (() => number) | undefined;
}

/**
 * Verify a webhook delivery and return the parsed event.
 *
 * `payload` MUST be the raw request body exactly as received — not `JSON.stringify(req.body)`,
 * whose key order and whitespace differ and so produce a different signature.
 *
 * ```ts
 * app.post('/webhooks/bulkit', express.raw({ type: 'application/json' }), async (req, res) => {
 *   const event = await verifyWebhook(req.body, req.headers, { secret });
 *   res.sendStatus(200);
 * });
 * ```
 *
 * @throws {WebhookVerificationError} if the signature or timestamp does not check out.
 */
export async function verifyWebhook(
  payload: string | Uint8Array,
  headers: HeadersLike,
  options: VerifyWebhookOptions,
): Promise<WebhookEvent> {
  const body = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
  const header = getHeader(headers, SIGNATURE_HEADER);
  if (!header) throw new WebhookVerificationError(`Missing ${SIGNATURE_HEADER} header.`);

  const { timestamp, signatures } = parseSignatureHeader(header);
  const now = Math.floor((options.now?.() ?? Date.now()) / 1000);
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - timestamp) > tolerance) {
    throw new WebhookVerificationError('Webhook timestamp is outside the tolerance window.');
  }

  const expected = await sign(options.secret, `${timestamp}.${body}`);
  if (!signatures.some((candidate) => timingSafeEqual(expected, candidate))) {
    throw new WebhookVerificationError('Webhook signature does not match.');
  }

  try {
    return JSON.parse(body) as WebhookEvent;
  } catch {
    throw new WebhookVerificationError('Webhook body is not valid JSON.');
  }
}

/** Compute the `x-bulkit-signature` header value for a payload. Useful for testing your receiver. */
export async function signWebhookPayload(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  return `t=${timestamp},v1=${await sign(secret, `${timestamp}.${payload}`)}`;
}

async function sign(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function parseSignatureHeader(header: string): { timestamp: number; signatures: string[] } {
  let timestamp = Number.NaN;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=', 2);
    if (key === 't') timestamp = Number(value);
    else if (key === 'v1' && value) signatures.push(value);
  }
  if (!Number.isInteger(timestamp) || signatures.length === 0) {
    throw new WebhookVerificationError(`Malformed ${SIGNATURE_HEADER} header.`);
  }
  return { timestamp, signatures };
}

/** Constant-time string comparison, so timing does not leak how much of a guess was right. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getHeader(headers: HeadersLike, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  const value = key === undefined ? undefined : headers[key];
  return Array.isArray(value) ? value[0] : value;
}
