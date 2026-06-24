# RFC 001: Core Architecture

## Status

Implemented prototype.

## Boundary

VibeLayer is a local-first middleware, not a database replacement, React
state library, cache wrapper, or product-specific data layer.

```txt
UI reads local entities.
UI writes named business mutations.
The SDK owns persistence, queues, retries, sync, and conflicts.
```

## State Model

Entity state is derived from durable queue records:

```txt
clean -> queued -> syncing -> clean
                    |
                    +-> failed -> queued -> syncing
                    |
                    +-> conflicted -> queued after explicit retry/resolution
```

There is no standalone in-memory dirty flag. Every dirty field is reconstructed
from persisted mutation effects after restart.

## Components

### Read-only Entity Store

UI adapters can `get`, `list`, `getSnapshot`, and `subscribe`. Client code cannot
write through the public store type.

### Mutation Runtime

A mutation declares:

- stable name
- human/Agent-readable description
- intended affected fields
- deterministic local apply function

The runtime instruments its transaction and records actual entity IDs,
operations, and fields in the queue.

### Atomic Storage

Official adapters implement:

```ts
saveState({ entities, mutations, meta })
```

IndexedDB writes these values in one transaction. This prevents a crash from
persisting a visible edit without its queue record, or a queue record without
the corresponding local entity.

### Sync Engine

Push and pull operations are serialized. Push:

1. moves queued/failed mutations to syncing
2. persists that state
3. sends ordered mutations
4. validates transport accounting and returned deltas
5. removes acknowledged mutations
6. marks rejected or unaccounted mutations
7. applies returned deltas through conflict middleware
8. atomically persists the result

Network exceptions mark syncing records as failed and preserve local entities.
Invalid transport accounting also fails retryably; local entities stay visible
and the queued business intent remains inspectable.

### Conflict Middleware

Handlers receive local, remote, delta, dirty fields, and pending mutations.
They return one explicit action:

- `useRemote`
- `useLocal`
- `merge`
- `delete`
- `manual`

Built-ins are `remoteWins`, `localWins`, `localDirtyWins`, and
`fieldLevelMerge`. Unknown policy names fail with a registration instruction.

Remote deletion is a normal conflict input and cannot bypass middleware.

### Backend Transport

Transports map business mutations to any backend. Delta-native backends can emit
incremental changes. Existing REST backends can implement diff mode by fetching
snapshots and projecting them into normalized deltas.

Transport responses must account for each pushed mutation exactly once. Ack only
after durable backend commit, reject known business failures explicitly, and
make client-generated IDs idempotent on retry.

The reference backend in `examples/todo-basic/reference-server.ts` demonstrates
the expected server boundary: processed mutation IDs are stored per client,
writes are applied in request order, canonical deltas are appended to a change
log, and pull resumes from a cursor.

### Existing Fetch Integration

`sync.reconcile(deltas)` accepts data already fetched by an existing application.
This allows incremental adoption without adding duplicate GET requests. The
operation is serialized with push/pull, uses normal conflict middleware, and
rolls back its in-memory changes if durable persistence fails.

`reconcile()` and `reconcileSnapshot()` return the canonical affected records
after conflict resolution plus explicit deleted entity references. Consumers
must render that result or read from the local store instead of continuing to
render the raw remote snapshot.

### Live Queries

`client.query(entity, { where, sort })` creates a live filtered projection over
the local store. It is framework-independent and is intended for UI adapters
that render project lists, kanban columns, inbox buckets, folders, labels, or
other scoped views.

Queries are not a second store. They subscribe to `client.store`, recompute
their filtered list after local mutations, remote reconcile, deletes, and
rollbacks, and notify listeners only when the projected records change. This
keeps derived UI lists mutation-aware without forcing product code to manually
patch every component-owned array after a write.

## ID Rule

New entities use client-generated stable IDs. The backend must preserve those
IDs or provide an explicit deterministic mapping protocol. Silent server ID
replacement is not supported because it breaks offline references and
idempotency.

## Current Limits

- No realtime stream coordinator
- No SQL/SQLite adapter
- No React hooks
- No CRDT rich-text layer
- No mutation compaction
- Manual conflict resolution exposes state but does not yet provide a dedicated
  resolution transaction API
