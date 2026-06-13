# VibeLayer Agent Guide

## Source Map

- Core runtime: `packages/core/src`
- Contract CLI: `packages/cli/src`
- Generic example: `examples/todo-basic`
- Reliability tests: `tests`

## Mandatory Rules

- Read UI data from `client.store`.
- Write data through `client.mutate(name, input)`.
- Preserve client-generated IDs in backend adapters.
- Mark user-editable drafts with `durableDraft: true`.
- Give durable drafts an explicit conflict policy.
- Keep backend-specific routes and serialization in transport adapters.
- Use `client.sync.retry()` for failed queue records.

## Forbidden Patterns

- Do not call remote write APIs directly from UI components.
- Do not call mutable `EntityStore` methods through a client.
- Do not remove or rewrite pending mutations during pull.
- Do not apply remote deletes outside conflict middleware.
- Do not add a mutation without `description` and `affects`.
- Do not generate a second server ID for an entity created offline.
- Do not put product-specific fields in `packages/core`.

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

## Recovery Guidance

- `failed`: inspect `client.sync.inspectQueue()`, fix transport/network, call
  `client.sync.retry()`.
- `conflicted`: inspect the mutation effects and conflict event; apply the
  product-specific resolution before retrying.
- stale UI: verify the component subscribes to `client.store`, not a second
  independently fetched snapshot.
