# Getting Started

This guide builds a minimal browser integration with durable IndexedDB storage
and an application-owned HTTP transport.

## Prerequisites

- Node.js `18.19` or newer
- a TypeScript application
- a backend endpoint that can accept client-generated IDs

Install the runtime:

```bash
npm install vibelayer
```

## 1. Define the Schema

Create `sync/schema.ts`:

```ts
import { defineSchema } from 'vibelayer';

export const schema = defineSchema({
  defaultConflict: 'fieldLevelMerge',
  entities: {
    todo: {
      description: 'A locally editable task.',
      fields: {
        id: { type: 'string' },
        title: {
          type: 'string',
          userEditable: true,
          durableDraft: true,
          conflict: 'localDirtyWins',
        },
        completed: {
          type: 'boolean',
          userEditable: true,
          conflict: 'localDirtyWins',
        },
        updatedAt: {
          type: 'datetime',
          conflict: 'remoteWins',
        },
      },
    },
  },
});
```

`durableDraft` documents that a user edit must survive reload and offline use.
`localDirtyWins` prevents an older remote response from overwriting that field
while a local mutation is pending.

## 2. Define Named Mutations

Create `sync/mutations.ts`:

```ts
import { defineMutations } from 'vibelayer';

export const mutations = defineMutations({
  'todo.create': {
    description: 'Create a todo locally before network sync.',
    affects: ['todo'],
    apply({ tx }, input: { id: string; title: string }) {
      tx.upsert('todo', {
        id: input.id,
        title: input.title,
        completed: false,
        updatedAt: null,
      });
    },
  },
  'todo.rename': {
    description: 'Rename a todo locally.',
    affects: ['todo.title'],
    apply({ tx }, input: { id: string; title: string }) {
      tx.patch('todo', input.id, { title: input.title });
    },
  },
});
```

Mutation `apply` functions must be deterministic and local. Do not call
`fetch`, read UI state, or perform unrelated side effects inside them.

## 3. Implement the Backend Transport

Create `sync/transport.ts`:

```ts
import type {
  EntityRecord,
  MutationRecord,
  PushRequest,
  PushResult,
  RemoteDelta,
  SyncTransport,
} from 'vibelayer';

type Todo = EntityRecord & {
  title: string;
  completed: boolean;
  updatedAt: string;
};

export class TodoTransport implements SyncTransport {
  async push(request: PushRequest): Promise<PushResult> {
    const ackedMutationIds: string[] = [];
    const rejected: NonNullable<PushResult['rejected']> = [];
    const deltas: RemoteDelta[] = [];

    for (const mutation of request.mutations) {
      try {
        const todo = await this.sendMutation(mutation);
        ackedMutationIds.push(mutation.id);
        deltas.push({
          entity: 'todo',
          id: todo.id,
          op: 'upsert',
          data: todo,
          version: todo.updatedAt,
        });
      } catch (error) {
        rejected.push({
          mutationId: mutation.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { ackedMutationIds, rejected, deltas };
  }

  private async sendMutation(mutation: MutationRecord): Promise<Todo> {
    if (mutation.name === 'todo.create') {
      return this.request('/api/todos', {
        method: 'POST',
        body: mutation.input,
      });
    }

    if (mutation.name === 'todo.rename') {
      const input = mutation.input as { id: string; title: string };
      return this.request(`/api/todos/${input.id}`, {
        method: 'PATCH',
        body: { title: input.title },
      });
    }

    throw new Error(`Unsupported mutation: ${mutation.name}`);
  }

  private async request(path: string, init: {
    method: string;
    body: unknown;
  }): Promise<Todo> {
    const response = await fetch(path, {
      method: init.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(init.body),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json() as Promise<Todo>;
  }
}
```

This adapter sends queued business mutations and returns normalized deltas. For
production requirements, including retry and conflict handling, read
[Transport Adapters](transport-adapters.md).

Production transports must treat `mutation.id` as an idempotency key. Ack only
after the backend has durably committed the write and recorded that mutation ID.
If the same mutation arrives again after a network failure, return the same ack
and canonical delta instead of applying the write twice.

For a complete backend reference, read
[`examples/todo-basic/reference-server.ts`](../examples/todo-basic/reference-server.ts).
It separates server responsibilities from the client transport adapter:

- the server records processed mutation IDs per client
- the server applies writes in request order
- the server appends canonical deltas to a change log
- the server serves pull requests by persisted cursor
- the transport only calls `server.push()` and `server.pull()`

In production, store the business write, processed mutation ID, and change-log
entry in one database transaction.

## 4. Create the Client

Create `sync/client.ts`:

```ts
import { IndexedDbStorageAdapter, SyncClient } from 'vibelayer';
import { mutations } from './mutations';
import { schema } from './schema';
import { TodoTransport } from './transport';

export const clientPromise = SyncClient.create({
  schema,
  mutations,
  storage: new IndexedDbStorageAdapter({
    databaseName: 'my-app-sync',
  }),
  transport: new TodoTransport(),
});
```

Create one client per local data boundary. Reuse it instead of constructing a
new client for each component or request.

## 5. Read and Write From the UI

The UI should read from the local store and write through named mutations. For
whole-app rendering, subscribe to `client.store`. For filtered views such as
project lists, kanban columns, inboxes, folders, or status buckets, prefer
`client.query()`:

```ts
const client = await clientPromise;

const pendingTodos = client.query('todo', {
  where: { status: 'pending' },
  sort: (left, right) => String(left.title).localeCompare(String(right.title)),
});

const unsubscribe = pendingTodos.subscribe((todos) => {
  renderTodos(todos);
});

await client.mutate('todo.create', {
  id: crypto.randomUUID(),
  title: 'Ship local-first support',
});

void client.sync.push().catch((error) => {
  console.error('Todo remains local and retryable', error);
});

// Call when the owning UI scope is disposed.
unsubscribe();
```

Do not append the new todo to a separate component-owned synchronized array.
The local mutation updates `client.store` before `client.mutate()` resolves, and
live queries update immediately when a record enters or leaves their filter.
For example, if a todo moves from `status: "pending"` to `status: "done"`, the
pending query removes it without waiting for the backend response.

## 6. Pull or Reconcile Remote Data

Implement `transport.pull()` when VibeLayer owns remote fetching:

```ts
await client.sync.pull();
```

If your application already fetched data, reconcile it without another request:

```ts
const result = await client.sync.reconcile([
  {
    entity: 'todo',
    id: remoteTodo.id,
    op: 'upsert',
    data: remoteTodo,
    version: remoteTodo.updatedAt,
  },
]);

const canonicalTodo = result.entities.todo?.todo_1;
```

Reconcile results contain only records affected by that operation, after
conflict resolution. Render full application state from `client.store`, and use
`client.getEntitySyncInfo(entity, id)` when the UI needs sync state, dirty
fields, effects, or mutation IDs.

If the reconciled records affect a live query, the query subscriber runs after
the store update. Do not keep rendering the raw REST array; render from
`client.query()` or `client.store` so local dirty fields and canonical conflict
results are preserved.

## 7. Handle Failures

```ts
const status = client.sync.status();
const queue = client.sync.inspectQueue();

if (status.failedCount > 0) {
  await client.sync.retry();
}
```

Network failures do not roll back local user edits. They leave mutations in the
durable queue with a `failed` state until retry.

## Integration Checklist

- Schema is lightweight sync metadata, not a replacement for backend
  validation.
- UI reads synchronized entities only from `client.store`.
- Filtered UI reads should use `client.query()` instead of component-owned
  synchronized arrays.
- UI writes only through `client.mutate()`.
- Creates use client-generated stable IDs.
- Backend create endpoints are idempotent for those IDs.
- Every user-editable draft has an explicit conflict policy.
- Transport acknowledges or rejects every pushed mutation exactly once.
- Transport returns minimal canonical deltas rather than broad stale snapshots.
- Custom storage implements atomic `saveState()`.
- Offline, restart, retry, stale response, and delete paths have tests.

## Agent Handoff Notes

When handing a VibeLayer integration to a coding agent, include:

- schema file path
- mutation registry file path
- transport adapter file path
- reference backend or backend route file path
- UI components that subscribe to `client.store`
- backend endpoints that receive pushed mutations
- verification commands

Tell the agent to inspect the contract before editing:

```bash
npm run vibelayer -- list entities --module ./sync/contract.ts
npm run vibelayer -- list mutations --module ./sync/contract.ts
npm run vibelayer -- explain todo.rename --module ./sync/contract.ts
```

## Next Steps

- Run the repository's [complete Todo example](../examples/todo-basic).
- Read [Transport Adapters](transport-adapters.md).
- Add an [Agent contract](../README.md#agent-tooling).
