# RFC 003: Packaging and Repository Extraction

## Status

Core package is independently buildable and installable. Addio consumes the
same package artifact through a local file dependency. Canonical repository:
`https://github.com/ahamoment-101/VibeLayer.git`

## Package Boundaries

### `vibelayer`

Owns only generic runtime behavior:

- readonly entity store
- atomic storage adapters
- durable mutation queue
- ordered push and pull
- conflict middleware
- restart recovery
- diagnostics and Agent contract primitives

It must not contain Addio entities, routes, React, authentication, or backend
models. It has no production dependencies.

### `vibelayer-cli`

Owns contract inspection for humans and coding agents. It may depend on Core
types and a TypeScript loader, but never on a consuming application.

### Future `vibelayer-react`

Should expose generic hooks over a supplied client or runtime:

```tsx
const items = useLocalEntities(runtime, 'todo', {
  where: (todo) => todo.projectId === projectId,
});
const status = useEntitySyncStatus(runtime, 'todo', todoId);
```

It must not know Addio field names or REST routes.

### Consumer Adapter

Each product owns:

- schema and named mutations
- backend transport and serialization
- authentication-aware runtime singleton
- domain commands
- domain React selectors and hooks
- server idempotency guarantees

Addio currently keeps this layer in `lib/local-sync`. It can later become an
example package, but it is not part of Core.

## External Installation

Runtime only:

```bash
npm install vibelayer
```

Agent contract tooling:

```bash
npm install --save-dev vibelayer-cli
```

The consuming application then creates four files:

```txt
sync/schema.ts       entities and conflict policies
sync/mutations.ts    named local transactions
sync/transport.ts    backend request mapping
sync/runtime.ts      authenticated client lifecycle
```

UI code reads subscribed local entities and invokes named domain commands. It
does not merge REST responses or maintain a second synchronized entity array.

## Extraction Sequence

1. Move `VibeLayer` to a standalone repository without changing package
   names or APIs.
   Minimal shell sequence:

   ```bash
   cp -R VibeLayer /tmp/VibeLayer
   cd /tmp/VibeLayer
   rm -rf node_modules
   git init
   git branch -M main
   git remote add origin git@github.com:ahamoment-101/VibeLayer.git
   npm ci
   npm run verify
   ```

2. Configure CI to run `npm run verify` on Node 18, 20, and 22.
3. Publish Core as `0.1.0` under an available npm organization.
4. Replace Addio's `file:` dependency with the published version.
5. Publish CLI after Core.
6. Extract generic React bindings only after two consumers demonstrate the
   same hook contract.
7. Keep the Addio adapter in Addio until another product proves which adapter
   abstractions are genuinely reusable.

## Release Gates

Every Core release must pass:

- typecheck
- deterministic offline, retry, conflict, and restart tests
- stale response protection
- ordered mixed-entity replay
- build of declarations and ESM output
- `npm pack`
- installation into a clean temporary project
- runtime import, mutation, and queue flush from the installed tarball
- Agent contract compatibility review

## Versioning

- Patch: bug fixes that preserve schema and mutation contracts.
- Minor: additive public APIs or optional contract fields.
- Major: storage format, conflict semantics, mutation protocol, or public API
  changes requiring consumer migration.

Persisted storage needs its own format version and migration registry before
the first stable release.

## Repository Defaults

The standalone repository should include:

- `.github/workflows/verify.yml`
- `.gitignore`
- `LICENSE`
- `CONTRIBUTING.md`
- root `README.md`
- `packages/core`
- `packages/cli`
- `docs`
- `tests`
- `examples`

That is the minimum shape needed for publishing, CI, and contributor onboarding.
