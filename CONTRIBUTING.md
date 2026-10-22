# Contributing

## Setup

```sh
corepack enable   # uses the pnpm version pinned in package.json
pnpm install
```

## Everyday commands

| Command              | What it does                                      |
| -------------------- | ------------------------------------------------- |
| `pnpm test`          | Run the test suite (Vitest)                       |
| `pnpm typecheck`     | Type-check `src`, `tests` and `examples`          |
| `pnpm lint:fix`      | Format and lint with Biome                        |
| `pnpm build`         | Bundle ESM + CJS + type declarations into `dist/` |
| `pnpm check:exports` | Validate the published package (publint + attw)   |
| `pnpm check`         | Everything CI runs                                |

## Project layout

```
spec/openapi.json        The API contract. The source of truth for every type.
src/
  index.ts               Public exports. Anything not exported here is private.
  client.ts              `Bulkit` client: auth, retries, timeouts, idempotency.
  types.ts               Friendly names for the generated schema types.
  webhooks.ts            Signature verification (no API key needed).
  core/                  Transport internals: errors, pagination, APIPromise.
  resources/             One file per API resource, thin and declarative.
  generated/openapi.ts   Generated. Never edit by hand.
tests/                   Unit tests against a mocked `fetch`.
examples/                Runnable scripts (`npx tsx examples/<name>.ts`).
```

## When the API changes

1. Replace `spec/openapi.json` with the new spec.
2. Run `pnpm generate` to regenerate `src/generated/openapi.ts`.
3. Add or adjust aliases in `src/types.ts` and methods in `src/resources/`.
4. Add a changeset (see below).

## Releasing

We use [Changesets](https://github.com/changesets/changesets). With every user-facing change,
run `pnpm changeset` and describe it. On `main`, the release workflow opens a "Version Packages"
PR. Merging that PR publishes to npm with provenance.
