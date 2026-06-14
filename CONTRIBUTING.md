# Contributing

## Start Here

Requirements:

- Node.js `18.19` or newer
- npm

```bash
git clone https://github.com/ahamoment-101/VibeLayer.git
cd VibeLayer
npm install
npm run verify
```

Before changing runtime behavior, read:

- [Core Architecture](docs/rfc-001-core-architecture.md)
- [Agent-Friendly SDK](docs/rfc-002-agent-friendly-sdk.md)
- [Transport Adapters](docs/transport-adapters.md)

## Repository Map

```txt
packages/core/   published runtime
packages/cli/    published contract inspection CLI
examples/        executable integrations
tests/           deterministic reliability tests
docs/            integration guides and architecture decisions
scripts/         package and release verification
```

## Development Commands

```bash
npm run typecheck       # TypeScript validation
npm test                # deterministic test suite
npm run test:watch      # focused local test loop
npm run example:todo    # executable local-first example
npm run contract:todo   # generated Agent contract
npm run build           # Core and CLI packages
npm run pack:check      # install and execute the packed runtime
npm run verify          # complete contribution gate
```

## Design Rules

- Keep Core framework-independent.
- Do not add product-specific entities, routes, authentication, or UI concerns
  to Core.
- Read synchronized application state from `client.store`.
- Route all writes through named mutations.
- Keep backend-specific serialization in transport adapters.
- Preserve client-generated stable IDs across retries.
- Every mutation must declare `description` and `affects`.
- Every durable user-editable field must have an explicit conflict policy.
- Agent-facing contract output must remain deterministic and explicit.
- Consumer integration tests belong in the consumer repository.

## Test Expectations

Behavior changes should include deterministic coverage for the affected
reliability boundary. Depending on the change, test:

- local write before network
- persistence failure rollback
- offline failure and retry
- restart recovery
- ordered replay
- stale remote responses
- remote deletes
- authoritative snapshot scope
- stable IDs and idempotent create behavior
- manual conflicts

Use `MemoryStorageAdapter` for most unit tests and `fake-indexeddb` for browser
persistence behavior. Do not make tests depend on an external backend.

## Pull Requests

- Keep changes focused and avoid unrelated refactors.
- Explain observable behavior changes.
- Update public docs when API or contract behavior changes.
- Add at least one verification case for every new reliability rule.
- Run `npm run verify` before requesting review.

## Package Boundaries

`vibelayer` and `vibelayer-cli` are published independently. When changing
exports, package metadata, or generated declarations, verify the packed artifact
rather than relying only on workspace imports.
