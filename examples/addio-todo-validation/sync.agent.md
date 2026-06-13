# Addio Todo Sync Integration

## Contract

- Schema: `schema.ts`
- Mutations: `mutations.ts`
- REST mapping: `transport.ts`
- Machine contract: `contract.ts`

## Durable Fields

- `todo.taskSummary`
- `todo.memoContent`
- `todo.memoBlocks`
- `todo.status`
- `todo.priority`
- `todo.projectId`
- `todo.subTasks`
- `think.title`
- `think.content`
- `think.pages`
- `think.projectId`
- `canvasCard.canvasId`
- `canvasCard.type`
- `canvasCard.refId`
- `canvasCard.position`

These fields use `localDirtyWins` inside `fieldLevelMerge`.

## Backend Requirement

`POST /api/todos/:todoId/subtasks` must preserve caller-provided `id` and `key`.
The Addio route remains backward compatible by generating IDs when they are
absent.

`POST /api/canvases/:canvasId/cards` must preserve caller-provided `cardId`.
Card deletion must be idempotent, and reordering must use stable card ids.

`POST /api/thinks` must preserve caller-provided `id`. Summary snapshots must
merge with local Note details instead of replacing `content` and `pages`.

## UI Migration Rule

All Addio Todo and Canvas-card UI surfaces call the shared local-sync runtime:

```txt
component local state -> client.mutate -> client.store subscription
```

Do not switch reads to the SDK while leaving writes as direct requests, or the
two local truths will diverge.

`npm run check:todo-sync-boundaries` enforces this boundary.

## Verification

```bash
npm test
npm run example:addio
npm run contract:addio
```
