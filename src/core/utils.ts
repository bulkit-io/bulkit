export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue | QueryValue[]>;

/** Reads an environment variable on runtimes that have `process`, and nothing on those that do not. */
export function readEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const value = env?.[name]?.trim();
  return value ? value : undefined;
}

/** Tagged template that URI-encodes every interpolated path segment. */
export function path(strings: TemplateStringsArray, ...params: string[]): string {
  return strings.reduce((acc, part, i) => {
    const param = params[i];
    if (param === undefined) return acc + part;
    if (param === '') throw new TypeError('Path parameters must not be empty.');
    return acc + part + encodeURIComponent(param);
  }, '');
}

export function buildQuery(query: Query | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null) params.append(key, String(item));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function uuid(): string {
  return globalThis.crypto.randomUUID();
}

export function isBrowser(): boolean {
  return (
    typeof (globalThis as { window?: unknown }).window !== 'undefined' &&
    typeof (globalThis as { document?: unknown }).document !== 'undefined'
  );
}
