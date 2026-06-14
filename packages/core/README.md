# VibeLayer

Framework-independent local-first sync runtime for TypeScript applications and
coding agents.

VibeLayer provides:

- a read-only local entity store
- durable named mutation queues
- IndexedDB and in-memory storage adapters
- ordered push and pull synchronization
- field-level conflict policies
- retry, diagnostics, and restart recovery

Your application supplies its schema, mutations, backend transport, and UI
bindings.

## Install

```bash
npm install vibelayer
```

## Minimal Setup

```ts
import {
  MemoryStorageAdapter,
  SyncClient,
  defineMutations,
  defineSchema,
} from 'vibelayer';

const schema = defineSchema({
  entities: {
    todo: {
      fields: {
        id: { type: 'string' },
        title: {
          type: 'string',
          durableDraft: true,
          conflict: 'localDirtyWins',
        },
      },
    },
  },
});

const mutations = defineMutations({
  'todo.create': {
    description: 'Create a todo locally.',
    affects: ['todo'],
    apply({ tx }, input: { id: string; title: string }) {
      tx.upsert('todo', input);
    },
  },
});

const client = await SyncClient.create({
  schema,
  mutations,
  storage: new MemoryStorageAdapter(),
  transport: {
    async push(request) {
      return {
        ackedMutationIds: request.mutations.map((mutation) => mutation.id),
      };
    },
  },
});

await client.mutate('todo.create', {
  id: crypto.randomUUID(),
  title: 'Local first',
});

client.store.list('todo');
await client.sync.push();
```

Use `IndexedDbStorageAdapter` for durable browser persistence. Production
transports must map named mutations to your backend and make offline creates
idempotent.

## Documentation

- [Getting Started](https://github.com/ahamoment-101/VibeLayer/blob/main/docs/getting-started.md)
- [Transport Adapters](https://github.com/ahamoment-101/VibeLayer/blob/main/docs/transport-adapters.md)
- [Complete Todo Example](https://github.com/ahamoment-101/VibeLayer/tree/main/examples/todo-basic)
- [Repository README](https://github.com/ahamoment-101/VibeLayer#readme)

Requires Node.js `18.19` or newer for development tooling. Browser persistence
uses the native IndexedDB API.

## License

MIT
