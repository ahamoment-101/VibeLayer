# VibeLayer Agent Guide

## Source Map

- Core runtime: `packages/core/src`
- Contract CLI: `packages/cli/src`
- Generic example: `examples/todo-basic`
- Reference backend: `examples/todo-basic/reference-server.ts`
- Reliability tests: `tests`

## Mandatory Rules

- Read UI data from `client.store`.
- Write data through `client.mutate(name, input)`.
- Preserve client-generated IDs in backend adapters.
- Mark user-editable drafts with `durableDraft: true`.
- Give durable drafts an explicit conflict policy.
- Keep backend-specific routes and serialization in transport adapters.
- Use `client.sync.retry()` for failed queue records.
- Treat schema as sync metadata, not as backend validation.
- Ack a mutation only after durable backend commit.
- Return minimal canonical deltas from transports.

## Forbidden Patterns

- Do not call remote write APIs directly from UI components.
- Do not call mutable `EntityStore` methods through a client.
- Do not remove or rewrite pending mutations during pull.
- Do not apply remote deletes outside conflict middleware.
- Do not add a mutation without `description` and `affects`.
- Do not generate a second server ID for an entity created offline.
- Do not put product-specific fields in `packages/core`.
- Do not return unknown, duplicate, or contradictory mutation acks.
- Do not return broad stale snapshots when a field-level patch is available.

## Discovery

```bash
npm run vibelayer -- list entities --module examples/todo-basic/contract.ts
npm run vibelayer -- list mutations --module examples/todo-basic/contract.ts
npm run vibelayer -- explain todo.updateMemo --module examples/todo-basic/contract.ts
```

## Verification

```bash
npm run typecheck
npm test
npm run example:todo
npm run contract:todo
```

When changing sync behavior, verify at least:

1. write before network
2. offline failure
3. process restart
4. ordered replay
5. stale remote delta
6. remote delete
7. retry
8. stable IDs
9. malformed transport accounting
10. repeated push after server commit

## Transport Rules

- Use `mutation.id` as the idempotency key.
- Store processed mutation IDs on the server side, scoped by client or
  authenticated sync actor.
- Preserve request mutation order when applying business writes.
- Return each pushed mutation exactly once in either `ackedMutationIds` or
  `rejected`.
- On retry after a committed-but-unacknowledged write, return the prior ack and
  canonical delta without applying the write again.
- Return `rejected` for validation, authorization, or business conflicts that
  the server understood.
- Throw only when the whole push or pull operation failed, such as network
  loss or unavailable auth.
- Include `data` for `upsert` deltas and `patch` for `patch` deltas.
- Use pull cursors or change-log versions that are safe to persist and resume.
- Use `examples/todo-basic/reference-server.ts` as the reference shape before
  inventing a new backend sync protocol.

## UI Adapter Rules

- Subscribe to `client.store` from React, Vue, Svelte, or any other UI layer for
  whole-app snapshots.
- Use `client.query(entity, options)` for filtered entity lists such as project
  columns, kanban states, inbox buckets, folders, labels, and search scopes.
- Call `client.mutate()` from commands and event handlers.
- Render sync status from `client.sync.status()` or
  `client.getEntitySyncInfo(entity, id)`.
- Keep framework-specific hooks outside `packages/core` unless they are
  published as a separate adapter package.
- Do not patch component-owned filtered arrays after a mutation. If the UI is
  stale, replace that array with a live query derived from `client.store`.

## Recovery Guidance

- `failed`: inspect `client.sync.inspectQueue()`, fix transport/network, call
  `client.sync.retry()`.
- `conflicted`: inspect the mutation effects and conflict event; apply the
  product-specific resolution before retrying.
- stale UI: verify the component subscribes to `client.store`, not a second
  independently fetched snapshot.
- stale filtered UI: verify it renders `client.query(entity, { where, sort })`
  instead of manually reconciling a copied list.
