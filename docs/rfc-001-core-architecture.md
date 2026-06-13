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
4. removes acknowledged mutations
5. marks rejected or unaccounted mutations
6. applies returned deltas through conflict middleware
7. atomically persists the result

Network exceptions mark syncing records as failed and preserve local entities.

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

### Existing Fetch Integration

`sync.reconcile(deltas)` accepts data already fetched by an existing application.
This allows incremental adoption without adding duplicate GET requests. The
operation is serialized with push/pull, uses normal conflict middleware, and
rolls back its in-memory changes if durable persistence fails.

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
