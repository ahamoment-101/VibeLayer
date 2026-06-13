# VibeLayer

Framework-independent local-first runtime for business applications.

```bash
npm install vibelayer
```

```ts
import {
  IndexedDbStorageAdapter,
  SyncClient,
  defineMutations,
  defineSchema,
} from 'vibelayer';
```

The host application owns its schema, named mutations, backend transport, and
framework bindings. The package owns local persistence, the durable queue,
ordered synchronization, conflict resolution, restart recovery, and
diagnostics.

See the repository README for the complete integration example.
