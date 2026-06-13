import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { IndexedDbStorageAdapter } from '../packages/core/src/index';

describe('IndexedDbStorageAdapter', () => {
  it('persists entities, mutations, and metadata across adapter instances', async () => {
    const indexedDB = new IDBFactory();
    const first = new IndexedDbStorageAdapter({
      databaseName: 'local-sync-test',
      indexedDB,
    });
    await first.saveEntities({ todo: { todo_1: { id: 'todo_1', title: 'Persistent' } } });
    await first.saveMutations([{
      id: 'mutation_1',
      name: 'todo.create',
      input: { id: 'todo_1' },
      status: 'queued',
      createdAt: 1,
      updatedAt: 1,
      attempts: 0,
      effects: [{
        entity: 'todo',
        id: 'todo_1',
        operation: 'upsert',
        fields: ['title'],
      }],
    }]);
    await first.saveMeta({ cursor: 42, clientId: 'browser-client' });
    first.close();

    const second = new IndexedDbStorageAdapter({
      databaseName: 'local-sync-test',
      indexedDB,
    });

    expect((await second.loadEntities()).todo.todo_1.title).toBe('Persistent');
    expect((await second.loadMutations())[0].id).toBe('mutation_1');
    expect(await second.loadMeta()).toEqual({ cursor: 42, clientId: 'browser-client' });
    second.close();
  });
});
