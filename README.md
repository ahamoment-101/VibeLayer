# VibeLayer

A framework-independent local-first sync runtime for TypeScript applications.

VibeLayer makes local persistence the immediate source of truth, records every
business mutation in a durable queue, and synchronizes that queue through an
application-owned backend adapter.

> Status: early `0.1.x` release. The core reliability model is tested, but the
> public API may still evolve before `1.0`.

## Why VibeLayer?

Use VibeLayer when your application needs:

- instant local writes that do not wait for the network
- offline edits that survive page reloads or process restarts
- ordered retries after network or backend failures
- explicit conflict policies for user-edited fields
- an application-specific REST, RPC, or delta sync adapter
- machine-readable schema and mutation contracts for coding agents

VibeLayer is not a database, backend service, realtime server, React state
library, or CRDT editor. Your application still owns its backend API, schema,
authentication, and UI bindings.

## How It Works

```txt
UI reads client.store
UI writes client.mutate(name, input)
              |
              v
atomic local persistence + durable mutation queue
              |
              v
application transport -> backend API
              |
              v
remote deltas -> conflict policy -> local store
```

The important boundary is simple:

- UI reads synchronized entities from `client.store`.
- UI writes business intent through named mutations.
- The transport is the only layer that knows backend routes and payloads.

## Try It In 60 Seconds

Requirements: Node.js `18.19` or newer and npm.

```bash
git clone https://github.com/ahamoment-101/VibeLayer.git
cd VibeLayer
npm install
npm run example:todo
```

The example performs three local mutations, prints local state before network
sync, pushes the durable queue through an in-memory transport, and prints the
resulting server state.

Explore the implementation:

- [schema](examples/todo-basic/schema.ts)
- [named mutations](examples/todo-basic/mutations.ts)
- [transport adapter](examples/todo-basic/fake-transport.ts)
- [client setup](examples/todo-basic/index.ts)

## Install

```bash
npm install vibelayer
```

The four integration pieces are:

```ts
import {
  IndexedDbStorageAdapter,
  SyncClient,
  defineMutations,
  defineSchema,
  type SyncTransport,
} from 'vibelayer';
```

1. Define synchronized entities and field conflict policies.
2. Define named local mutations.
3. Implement `SyncTransport` against your backend.
4. Create one client and subscribe the UI to its store.

Follow the complete, copyable integration in
[Getting Started](docs/getting-started.md).

## Core Concepts

### Schema

The schema documents entities, durable user-editable fields, and conflict
policies. It is runtime metadata, not a database schema validator.

### Named Mutations

Every write has a stable name, description, declared effects, and deterministic
local transaction. A mutation is persisted locally before it is eligible for
network sync.

### Storage

- `IndexedDbStorageAdapter` provides durable browser persistence.
- `MemoryStorageAdapter` is ephemeral and intended for tests and examples.
- Custom adapters should implement atomic `saveState()` for the strongest crash
  guarantees.

### Transport

Your transport maps queued business mutations to backend requests and maps
backend responses to normalized remote deltas. Read
[Writing a Transport Adapter](docs/transport-adapters.md) before integrating a
production API.

### Conflict Policies

Built-in policies include `remoteWins`, `localWins`, `localDirtyWins`, and
`fieldLevelMerge`. User drafts typically use `localDirtyWins` so stale remote
responses cannot overwrite pending local edits.

## Common Operations

```ts
await client.mutate('todo.updateTitle', {
  id: 'todo_1',
  title: 'Local first',
});

client.store.get('todo', 'todo_1');
client.store.list('todo');
client.store.subscribe(() => render(client.store.getSnapshot()));

await client.sync.push();
await client.sync.pull();
await client.sync.syncNow();
await client.sync.retry();

client.sync.status();
client.sync.inspectQueue();
client.getEntitySyncState('todo', 'todo_1');
client.diagnostics();
```

If the application already fetches remote data, use `reconcile()` instead of
issuing a duplicate pull:

```ts
await client.sync.reconcile(remoteDeltas, { cursor });

await client.sync.reconcileSnapshot('todo', remoteTodos, {
  deleteMissing: true,
  includeLocal: (todo) => todo.projectId === activeProjectId,
});
```

## Agent Tooling

Install the optional contract CLI:

```bash
npm install --save-dev vibelayer-cli
```

Export a contract from your schema and mutations:

```ts
import { createAgentContract } from 'vibelayer';
import { mutations } from './mutations';
import { schema } from './schema';

export const contract = createAgentContract(schema, mutations);
```

Inspect it from a terminal or coding agent:

```bash
npx vibelayer inspect --module ./sync/contract.ts
npx vibelayer list entities --module ./sync/contract.ts
npx vibelayer list mutations --module ./sync/contract.ts
npx vibelayer explain todo.updateTitle --module ./sync/contract.ts
```

## Documentation

- [Getting Started](docs/getting-started.md): complete first integration
- [Transport Adapters](docs/transport-adapters.md): backend mapping and failure rules
- [Agent Guide](docs/sync.agent.md): repository rules for coding agents
- [Core Architecture](docs/rfc-001-core-architecture.md): runtime boundaries
- [Agent-Friendly SDK](docs/rfc-002-agent-friendly-sdk.md): contract design
- [Packaging and Publishing](docs/rfc-003-packaging-and-publishing.md): package boundaries

## Reliability Guarantees

- Entity changes and queue records are atomically persisted by official adapters.
- Interrupted `syncing` mutations recover as `queued` after restart.
- Push failures preserve local data and become explicitly retryable.
- Pull cursors survive restart.
- Remote deletes pass through conflict resolution.
- Push and pull operations are serialized.
- Queue replay preserves the original client-generated IDs.
- Mutation effects expose the entity IDs and fields still pending.

Duplicate-free retries depend on the backend preserving client-generated IDs
and treating repeated creates and deletes idempotently, or providing an explicit
ID remapping protocol.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| UI reverts after a request | Read from `client.store`; do not merge a second server snapshot into component state. |
| Local edit disappears after pull | Mark the field `durableDraft: true` and choose an explicit conflict policy. |
| Queue remains failed | Inspect `client.sync.inspectQueue()`, fix the transport error, then call `client.sync.retry()`. |
| Create is duplicated after retry | Make the backend create endpoint idempotent for the client-generated ID. |
| Mutation is rejected locally | Ensure it declares `description`, `affects`, and writes at least one entity. |
| Data is lost on custom storage failure | Implement atomic `saveState()` instead of separate entity and queue writes. |

## Repository Development

```bash
npm install
npm run verify
```

`npm run verify` runs type checking, deterministic tests, package builds, and a
real `npm pack` installation smoke test.

Useful focused commands:

```bash
npm test
npm run example:todo
npm run contract:todo
npm run vibelayer -- list mutations --module examples/todo-basic/contract.ts
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before changing runtime behavior.

## License

[MIT](LICENSE)
