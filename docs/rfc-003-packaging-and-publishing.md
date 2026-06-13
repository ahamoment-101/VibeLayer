# RFC 003: Packaging and Publishing

## Status

Core and CLI packages are independently buildable and installable. Canonical
repository: `https://github.com/ahamoment-101/VibeLayer.git`

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

It must not contain product entities, routes, React, authentication, or backend
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

It must not know consumer field names or REST routes.

### Consumer Adapter

Each product owns:

- schema and named mutations
- backend transport and serialization
- authentication-aware runtime singleton
- domain commands
- domain React selectors and hooks
- server idempotency guarantees

This layer remains in the consuming application unless multiple products prove
that a reusable adapter package is warranted.

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

## Registry Requirement

Consumers should install published registry versions rather than depending on
the workspace root through Git or a local `file:` path:

```json
"vibelayer": "^0.1.0"
```

This repository is a workspace root, while the runtime package is
`packages/core`. Registry publication preserves the intended package boundary.

## Publishing Sequence

1. Run `npm run verify` on supported Node versions.
2. Publish `vibelayer`.
3. Publish `vibelayer-cli` against the same Core version.
4. Update consuming applications to a registry version.
5. Extract generic framework bindings only after multiple consumers
   demonstrate the same contract.

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
