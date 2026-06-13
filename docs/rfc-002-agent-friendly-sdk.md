# RFC 002: Agent-Friendly SDK

## Status

Implemented foundation.

## Definition

Agent-friendly means the SDK is:

- readable: architecture rules are explicit
- discoverable: entities and mutations are machine-readable
- operable: ordinary changes use a small stable API
- verifiable: deterministic scenarios have fixed commands
- recoverable: errors explain the correct next action

## Machine Contract

`createAgentContract(schema, mutations)` produces protocol version 1 JSON with:

- entity and field descriptions
- durable draft markers
- conflict policies
- mutation names, descriptions, and effects
- required reliability scenarios

The CLI can inspect a contract module:

```bash
vibelayer inspect --module ./sync/contract.ts
vibelayer list entities --module ./sync/contract.ts
vibelayer list mutations --module ./sync/contract.ts
vibelayer explain todo.updateTitle --module ./sync/contract.ts
```

This is intentionally deterministic and stdout-friendly so coding agents can
consume it without scraping prose.

## API Constraints That Guide Agents

- `client.store` is read-only.
- `client.queue` is private.
- mutations require `description` and `affects`.
- unknown mutation errors list available mutations.
- unknown conflict policies explain where to register the handler.
- push errors state that local data remains queued.
- runtime mutation effects are inspectable.

These constraints turn common architectural mistakes into immediate,
actionable failures.

## Project Integration File

Every consuming project should keep a `sync.agent.md` near its schema. It must
state:

- schema and mutation locations
- transport location
- UI read/write rules
- durable draft fields
- conflict strategy
- verification commands
- forbidden direct API paths

## Required Agent Workflow

1. Inspect the contract.
2. Reuse an existing mutation when possible.
3. Add schema metadata before adding a new durable field.
4. Keep business mapping in the consuming app's transport.
5. Add a deterministic failure/restart/conflict test.
6. Run typecheck, tests, and the relevant example.

## Future Work

- `vibelayer generate mutation`
- `vibelayer verify contract`
- generated React bindings
- contract compatibility diffing in CI
- structured conflict-resolution recipes
