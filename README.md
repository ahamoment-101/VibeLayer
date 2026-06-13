# VibeLayer

A developer- and Agent-friendly local-first data layer for vibe-coded apps.

This folder is a standalone workspace and can be moved out of Addio into its own
repository: `https://github.com/ahamoment-101/VibeLayer.git`.

## Runtime Model

```txt
UI -> readonly local store
UI -> named mutation -> atomic local persistence -> durable queue
                                      |
                                      v
                              sync engine -> backend adapter
                                      |
                                      v
                           conflict policy -> local store
```

The UI never waits for the network to display a user edit. The SDK owns retry,
ordering, remote reconciliation, cursor persistence, and diagnostics.

Framework adapters should make the SDK store the only entity source. For React,
the application pattern is:

```tsx
const { todos, loading, refresh } = useTodos({ projectId });

await commands.createTodo(input);
// Do not append to a component-owned array. The SDK subscription publishes it.
```

Components may own transient drafts, selection, focus, and layout. They should
not own a second mutable copy of synchronized entities or merge network
responses manually.

## Quick Start

Install the runtime:

```bash
npm install vibelayer
```

```ts
import {
  IndexedDbStorageAdapter,
  SyncClient,
  createResilientInitializer,
  defineMutations,
  defineSchema,
} from 'vibelayer';

const schema = defineSchema({
  entities: {
    todo: {
      conflict: 'fieldLevelMerge',
      fields: {
        title: {
          type: 'string',
          userEditable: true,
          durableDraft: true,
          conflict: 'localDirtyWins',
        },
      },
    },
  },
});

const mutations = defineMutations({
  'todo.updateTitle': {
    description: 'Update a todo title.',
    affects: ['todo.title'],
    apply({ tx }, input: { id: string; title: string }) {
      tx.patch('todo', input.id, { title: input.title });
    },
  },
});

const client = await SyncClient.create({
  schema,
  mutations,
  storage: new IndexedDbStorageAdapter({ databaseName: 'my-app' }),
  transport,
});

await client.mutate('todo.updateTitle', { id: 'todo_1', title: 'Local first' });
client.store.get('todo', 'todo_1');
await client.sync.syncNow();
```

Application integrations can keep SDK startup recoverable without coupling the
Core to React or a specific authentication system:

```ts
const runtime = createResilientInitializer({
  create: () => createMySyncClient(),
  shouldRetry: (error) => !isAuthenticationError(error),
});

runtime.start().catch(() => null);
const client = await runtime.get(); // user actions retry immediately
runtime.status(); // idle | initializing | ready | degraded | disposed
```

`client.store` is read-only at the public type boundary. Writes go through named
mutations so they cannot bypass persistence and sync.

## Reliability Guarantees

- Local entity and queue changes are atomically persisted by official adapters.
- Interrupted `syncing` mutations recover as `queued` on restart.
- Push failures preserve local data and become explicitly retryable.
- Pull cursors survive restart.
- Remote deletes go through conflict resolution.
- Authoritative snapshots can delete missing records within an explicit scope.
- Initialization failures support automatic backoff and action-triggered retry.
- Mutation effects identify the exact entity IDs and fields still pending.
- Creates use client-generated stable IDs and replay through ordinary named
  mutations; adapters must make remote create endpoints idempotent for those IDs.

Custom storage adapters should implement `saveState()` atomically. Legacy
adapters without it remain supported but cannot provide the same crash boundary.

## Observability

```ts
client.sync.status();
client.sync.inspectQueue();
client.getEntitySyncState('todo', 'todo_1');
client.inspect();
await client.sync.reconcile(alreadyFetchedDeltas);
await client.sync.reconcileSnapshot('todo', projectTodos, {
  deleteMissing: true,
  includeLocal: (todo) => todo.projectId === activeProjectId,
});
client.sync.subscribe((event) => console.log(event));
await client.sync.retry();
```

Use `reconcile()` when the consuming application already fetched remote data.
It applies the same conflict rules without issuing another network request.

## Agent Tooling

Install the optional contract CLI:

```bash
npm install --save-dev vibelayer-cli
```

```bash
npx vibelayer list entities --module ./sync/contract.ts
npx vibelayer list mutations --module ./sync/contract.ts
npx vibelayer explain todo.updateMemo --module ./sync/contract.ts
```

The generated contract exposes entities, durable drafts, conflict policies,
mutation capabilities, and required verification scenarios without requiring an
Agent to infer them from implementation code.

## Workspace

```txt
packages/core/                 framework-independent runtime
packages/cli/                  contract inspection CLI
examples/todo-basic/           generic example
examples/addio-todo-validation Addio REST adapter validation
tests/                         deterministic reliability scenarios
docs/                          architecture and Agent guidance
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run pack:check
npm run example:todo
npm run example:addio
```

The runtime has no production dependencies. IndexedDB uses the browser's native
API.

## Extraction

When you move this folder into its own repository, keep these top-level files:

```txt
.github/workflows/verify.yml
.gitignore
CONTRIBUTING.md
LICENSE
README.md
docs/
examples/
packages/
scripts/
tests/
package.json
package-lock.json
tsconfig.json
```

The standalone repository should run `npm run verify` as its default CI gate.
Consumer-specific integration tests should stay in the consuming application.
In Addio they live under `tests/vibelayer-consumer/` and run through the same
Vitest binary without making Core depend on Addio source files.

## Repository Split

The folder can move to a standalone repository without Addio. Keep
`packages/core`, `packages/cli`, `examples`, `tests`, and `docs`. Addio-specific
schema, transport, React hooks, and REST mappings remain consumer code and
should eventually move into a separate example or adapter package such as
`vibelayer-addio-adapter`.

Publishing order:

1. Publish `vibelayer`.
2. Publish `vibelayer-cli`, which depends on the same Core version.
3. In consuming apps, install Core and define the app-owned schema, mutations,
   transport, runtime singleton, and framework hooks.
4. Run `npm run verify` before every release. It includes deterministic
   reliability tests and a real `npm pack` installation smoke test.
