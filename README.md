# VibeLayer

A local-first state layer for TypeScript apps built by coding agents.

VibeLayer stops agent-generated apps from scattering `fetch()` calls across
components, making every click wait for the server, and losing local edits
when the network fails.

UI reads from `client.store`.
UI writes through named mutations.
VibeLayer persists local state + mutation queue first, then syncs through your
backend adapter.

The public launch site now lives in `site/`, which is a separate git repo for
the landing page and future blog.

> Status: early `0.1.x` release. The core reliability model is tested, but the
> public API may still evolve before `1.0`.

## Why VibeLayer?

Vibe coding often produces web apps where every click becomes a server round
trip. The generated UI feels slow, inconsistent, and hard to recover after a
failure because the agent writes directly to the backend instead of building a
local-first state model.

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

## Why Agent Friendly?

Agents work better when the rules are explicit and easy to inspect. VibeLayer
turns the main failure modes of generated apps into visible contracts:

- UI reads from `client.store`, so the agent has one source of truth instead of
  a local state copy and a server copy.
- UI writes through named mutations, so the agent cannot skip persistence or
  bypass conflict handling with ad hoc `fetch()` calls.
- Schema metadata marks durable drafts and conflict policies, so the agent can
  tell which fields are safe to edit offline.
- The transport boundary isolates backend routes, payloads, and auth, so the
  agent can change UI behavior without coupling it to server internals.
- `createAgentContract()` exposes entities, mutations, and verification
  scenarios as JSON, so another agent or CI job can inspect the integration
  without reading prose or source internals.

That combination makes the generated app easier to reason about, easier to
repair, and much less likely to degrade into a server-every-click experience.

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

## Reliability Model

VibeLayer is intentionally schema-light and transport-explicit:

- Schema is runtime metadata for entities, durable draft fields, and conflict
  policies. It is not a database validator and does not replace your backend
  schema.
- Local mutations are persisted and replayed in order. Push, pull, reconcile,
  and retry operations are serialized inside the client.
- Transports return normalized deltas: `upsert`, `patch`, or `delete`. Return
  the smallest confirmed backend change you can, especially for stale REST
  responses.
- Every pushed mutation must be accounted for exactly once: either in
  `ackedMutationIds` after durable backend commit, or in `rejected` with an
  explicit error. Unknown, duplicate, or contradictory acknowledgements fail
  retryably.
- Create and delete endpoints should be idempotent for client-generated IDs
  because the server may commit before the client receives the ack.
- UI framework adapters should subscribe to `client.store` and call
  `client.mutate()`. Framework bindings are integration code; they should not
  bypass the queue, conflict middleware, or transport boundary.

The current core is client/server local-first sync middleware. It does not try
to be a decentralized database, realtime coordinator, or CRDT layer.

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
- [reference sync server](examples/todo-basic/reference-server.ts)
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
4. Create one client and render live queries from the local store.

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

const pendingTodos = client.query('todo', {
  where: { status: 'pending' },
  sort: (left, right) => String(left.title).localeCompare(String(right.title)),
});
pendingTodos.subscribe((todos) => renderTodoList(todos));

await client.sync.push();
await client.sync.pull();
await client.sync.syncNow();
await client.sync.retry();

client.sync.status();
client.sync.inspectQueue();
client.getEntitySyncState('todo', 'todo_1');
client.getEntitySyncInfo('todo', 'todo_1');
client.diagnostics();
```

If the application already fetches remote data, use `reconcile()` instead of
issuing a duplicate pull:

```ts
const result = await client.sync.reconcile(remoteDeltas, { cursor });

const snapshotResult = await client.sync.reconcileSnapshot('todo', remoteTodos, {
  deleteMissing: true,
  includeLocal: (todo) => todo.projectId === activeProjectId,
});

const canonicalTodo = result.entities.todo?.todo_1;
const canonicalProjectTodos = snapshotResult.entities.todo || {};
render(client.store.getSnapshot());
```

Both reconcile methods return the canonical records affected by that operation
after conflict resolution. Read specific affected records from the result, or
render the full application state from `client.store`; do not continue rendering
the raw REST response because it may contain fields older than pending local
edits.

`getEntitySyncInfo(entity, id)` returns the entity state, dirty fields, effects,
and mutation IDs without requiring consumers to scan the mutation queue.

`client.query(entity, options)` returns a live filtered projection over the
local store. Use it for project lists, kanban columns, inbox filters, folders,
or any UI that renders a subset of an entity type. Local mutations, remote
reconcile results, deletes, and rollbacks all update the query because it is
derived from `client.store`. This avoids the common bug where a business
mutation updates the entity but a filtered UI keeps rendering a stale array.

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
