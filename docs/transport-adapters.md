# Writing a Transport Adapter

`SyncTransport` is the boundary between VibeLayer's generic local runtime and
your application's backend protocol.

```ts
type SyncTransport = {
  push(request: PushRequest): Promise<PushResult>;
  pull?(request: PullRequest): Promise<PullResult>;
};
```

The transport may call REST endpoints, RPC methods, GraphQL mutations, or a
delta-native sync service. Core does not know backend routes or authentication.

## Push Contract

VibeLayer calls `push()` with an ordered list of durable mutation records:

```ts
type PushRequest = {
  clientId: string;
  mutations: MutationRecord[];
};
```

Return a result that accounts for every mutation:

```ts
type PushResult = {
  ackedMutationIds: string[];
  rejected?: Array<{
    mutationId: string;
    error: string;
    conflict?: boolean;
  }>;
  deltas?: RemoteDelta[];
};
```

- Add an ID to `ackedMutationIds` only after the backend durably accepted it.
- Add failures to `rejected`; use `conflict: true` for manual conflict handling.
- Return canonical backend state as `deltas`.
- Do not silently omit a mutation. Unaccounted mutations are marked failed.
- Do not acknowledge IDs that were not in the request.
- Do not acknowledge and reject the same mutation.
- Do not acknowledge a mutation more than once in the same response.

VibeLayer preserves mutation order within each push batch.

VibeLayer validates this accounting before it mutates the queue. Invalid
transport responses fail the in-flight records retryably, preserving local data.

## Mapping Business Mutations

Keep the mapping explicit:

```ts
async function sendMutation(mutation: MutationRecord) {
  switch (mutation.name) {
    case 'todo.create':
      return post('/api/todos', mutation.input);
    case 'todo.rename': {
      const input = mutation.input as { id: string; title: string };
      return patch(`/api/todos/${input.id}`, { title: input.title });
    }
    default:
      throw new Error(`Unsupported mutation: ${mutation.name}`);
  }
}
```

Avoid generic endpoint guessing based on entity names. Named mutations represent
business intent and may map to different routes, transactions, or services.

## Returning Deltas

A remote delta is one normalized entity change:

```ts
type RemoteDelta = {
  entity: string;
  id: string;
  op: 'upsert' | 'patch' | 'delete';
  data?: EntityRecord;
  patch?: Record<string, unknown>;
  version?: string | number;
};
```

Examples:

```ts
const created: RemoteDelta = {
  entity: 'todo',
  id: todo.id,
  op: 'upsert',
  data: todo,
  version: todo.updatedAt,
};

const renamed: RemoteDelta = {
  entity: 'todo',
  id: todo.id,
  op: 'patch',
  patch: { title: todo.title, updatedAt: todo.updatedAt },
  version: todo.updatedAt,
};

const deleted: RemoteDelta = {
  entity: 'todo',
  id: todoId,
  op: 'delete',
};
```

Return only fields confirmed by the backend. A broad stale snapshot can
unnecessarily invoke conflict resolution for unrelated fields.

`upsert` deltas must include `data`; `patch` deltas must include `patch`;
`delete` deltas only need `entity`, `id`, and optional `version`.

For existing REST APIs, do not guess a patch by diffing arbitrary UI state.
Prefer one of these sources:

- the canonical record returned by the write endpoint
- a server-side change log
- a deliberately scoped REST snapshot projected into field patches
- the mutation's declared business effect when the backend confirms success

## Pull Contract

Implement `pull()` when the transport owns remote fetching:

```ts
async pull(request: PullRequest): Promise<PullResult> {
  const response = await fetch(`/api/sync?cursor=${request.cursor ?? ''}`);
  const payload = await response.json();

  return {
    cursor: payload.nextCursor,
    deltas: payload.changes,
  };
}
```

The cursor is persisted by the storage adapter and supplied to the next pull.
If the application already fetches remote data, omit `pull()` and call
`client.sync.reconcile()` or `reconcileSnapshot()`. Both methods return the
canonical affected records after conflict resolution. Consumers should render
those records or read from `client.store`, never continue with the raw REST
snapshot.

## Stable IDs and Idempotency

Offline creates must use a client-generated stable ID:

```ts
await client.mutate('todo.create', {
  id: crypto.randomUUID(),
  title: 'Created offline',
});
```

The backend should preserve this ID and treat repeated creates with the same ID
as the same operation. Network failure can occur after the server commits but
before the client receives the response, so retries must not create duplicates.

If the backend cannot preserve IDs, call `client.remapEntityId()` with a
`rewriteMutation` function that also updates pending references. Explicit
remapping is safer than silently replacing IDs in transport responses.

The server should store processed mutation IDs per client or per authenticated
sync actor. If a retry repeats a mutation that was already committed, return
the same acknowledgement and canonical delta instead of applying it again.

A minimal server-side push transaction should do this:

1. authenticate the sync actor
2. load each mutation ID in request order
3. skip and acknowledge already-processed IDs
4. validate authorization and current server state
5. commit the business write and processed mutation ID atomically
6. append a canonical change-log entry
7. return exactly one ack or rejection for each pushed mutation

The Todo example includes a copyable in-memory reference server:

- [reference-server.ts](../examples/todo-basic/reference-server.ts) owns
  processed mutation IDs, ordered writes, canonical deltas, and cursor pull.
- [fake-transport.ts](../examples/todo-basic/fake-transport.ts) is only the
  client-side adapter that calls that server.

Use that split in real applications: server code owns idempotency and change
logs; transport code only maps VibeLayer requests to your backend protocol.

## Authentication

Authentication belongs in the transport or the client lifecycle around it:

```ts
const response = await fetch(path, {
  credentials: 'include',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${await getAccessToken()}`,
  },
});
```

Do not put auth state into Core schema or mutation logic.

## Failure Rules

There are two failure modes:

1. Throw from `push()` when the entire operation failed, such as loss of
   connectivity. VibeLayer marks all in-flight mutations failed and retryable.
2. Return `rejected` entries when the request completed but individual
   mutations failed validation or authorization.

For manual conflicts:

```ts
return {
  ackedMutationIds: [],
  rejected: [{
    mutationId: mutation.id,
    error: 'Server version changed',
    conflict: true,
  }],
};
```

## Production Checklist

- Every pushed mutation is acknowledged or rejected.
- Requests preserve mutation order where business behavior depends on it.
- Create endpoints are idempotent for client-generated IDs.
- Delete endpoints are idempotent.
- Returned deltas contain canonical IDs and confirmed fields.
- Pull cursors are monotonic or otherwise safe to persist and resume.
- Authentication expiry produces a clear retry or reinitialization path.
- Offline-after-commit retries do not duplicate writes.
- Server-committed but client-unacknowledged mutations are acknowledged on
  retry without applying the write again.
- Tests cover mixed success, rejection, thrown network errors, and stale deltas.

See [examples/todo-basic/reference-server.ts](../examples/todo-basic/reference-server.ts)
for the backend reference and
[examples/todo-basic/fake-transport.ts](../examples/todo-basic/fake-transport.ts)
for the matching client transport.
