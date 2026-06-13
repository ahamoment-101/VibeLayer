import { describe, expect, it } from 'vitest';
import {
  MemoryStorageAdapter,
  SyncClient,
  defineMutations,
  defineSchema,
} from '../packages/core/src/index';
import { sequentialIds, TestTransport } from './helpers';

const schema = defineSchema({
  defaultConflict: 'fieldLevelMerge',
  entities: {
    todo: {
      conflict: 'fieldLevelMerge',
      fields: {
        id: { type: 'string' },
        title: { type: 'string', conflict: 'localDirtyWins', durableDraft: true },
        memo: { type: 'text', conflict: 'localDirtyWins', durableDraft: true },
        status: { type: 'string', conflict: 'remoteWins' },
      },
    },
  },
});

const mutations = defineMutations({
  'todo.create': {
    description: 'Create a todo.',
    affects: ['todo'],
    apply({ tx }, input: { id: string; title: string }) {
      tx.upsert('todo', { id: input.id, title: input.title, memo: '', status: 'pending' });
    },
  },
  'todo.updateMemo': {
    description: 'Update a durable memo.',
    affects: ['todo.memo'],
    apply({ tx }, input: { id: string; memo: string }) {
      tx.patch('todo', input.id, { memo: input.memo });
    },
  },
  'todo.delete': {
    description: 'Delete a todo.',
    affects: ['todo'],
    apply({ tx }, input: { id: string }) {
      tx.delete('todo', input.id);
    },
  },
});

async function createClient(
  storage = new MemoryStorageAdapter(),
  transport = new TestTransport(),
) {
  const client = await SyncClient.create({
    clientId: 'test-client',
    schema,
    mutations,
    storage,
    transport,
    id: sequentialIds('mutation'),
  });
  return { client, storage, transport };
}

describe('SyncClient reliability', () => {
  it('makes local writes visible and durable before network sync', async () => {
    const { client, storage, transport } = await createClient();

    await client.mutate('todo.create', { id: 'todo_1', title: 'Local first' });

    expect(client.store.get('todo', 'todo_1')?.title).toBe('Local first');
    expect((await storage.loadEntities()).todo.todo_1.title).toBe('Local first');
    expect(transport.pushes).toHaveLength(0);
    expect(client.getEntitySyncState('todo', 'todo_1')).toBe('queued');
    expect(client.inspect().queue[0].effects).toEqual([{
      entity: 'todo',
      id: 'todo_1',
      operation: 'upsert',
      fields: ['title', 'memo', 'status'],
    }]);
  });

  it('exposes redacted diagnostics without mutation inputs or entity bodies', async () => {
    const { client } = await createClient();
    await client.mutate('todo.create', { id: 'todo_1', title: 'Sensitive title' });

    const diagnostics = client.diagnostics();
    const serialized = JSON.stringify(diagnostics);

    expect(diagnostics.queue[0]).toMatchObject({
      name: 'todo.create',
      status: 'queued',
      effects: [{
        entity: 'todo',
        id: 'todo_1',
        operation: 'upsert',
      }],
    });
    expect(diagnostics.events.some((event) => event.type === 'mutation-enqueued')).toBe(true);
    expect(serialized).not.toContain('Sensitive title');
    expect(serialized).not.toContain('"input"');
  });

  it('atomically remaps a temporary entity id and queued mutation references', async () => {
    const { client, storage } = await createClient();
    await client.mutate('todo.create', { id: 'draft_1', title: 'Temporary' });
    await client.mutate('todo.updateMemo', { id: 'draft_1', memo: 'Queued edit' });

    await client.remapEntityId('todo', 'draft_1', 'todo_1', {
      rewriteMutation(mutation, { fromId, toId }) {
        if ((mutation.input as { id?: string })?.id !== fromId) return mutation;
        return {
          ...mutation,
          input: { ...(mutation.input as object), id: toId },
        };
      },
    });

    expect(client.store.get('todo', 'draft_1')).toBeUndefined();
    expect(client.store.get('todo', 'todo_1')).toMatchObject({
      id: 'todo_1',
      title: 'Temporary',
      memo: 'Queued edit',
    });
    expect(client.sync.inspectQueue().every((mutation) => (
      mutation.effects.every((effect) => effect.id === 'todo_1')
      && (mutation.input as { id: string }).id === 'todo_1'
    ))).toBe(true);
    expect((await storage.loadEntities()).todo.todo_1.id).toBe('todo_1');
    expect((await storage.loadMutations()).every((mutation) => (
      mutation.effects.every((effect) => effect.id === 'todo_1')
    ))).toBe(true);
  });

  it('atomically discards an entity and all queued mutations that reference it', async () => {
    const { client, storage } = await createClient();
    await client.mutate('todo.create', { id: 'draft_1', title: 'Temporary' });
    await client.mutate('todo.updateMemo', { id: 'draft_1', memo: 'Unrecoverable edit' });

    await client.discardEntityState('todo', 'draft_1');

    expect(client.store.get('todo', 'draft_1')).toBeUndefined();
    expect(client.sync.inspectQueue()).toEqual([]);
    expect((await storage.loadEntities()).todo?.draft_1).toBeUndefined();
    expect(await storage.loadMutations()).toEqual([]);
  });

  it('rolls back local state when durable persistence fails', async () => {
    const storage = new MemoryStorageAdapter();
    const transport = new TestTransport();
    const { client } = await createClient(storage, transport);
    await client.mutate('todo.create', { id: 'todo_1', title: 'Before failure' });
    await client.sync.push();
    storage.saveState = async () => {
      throw new Error('disk full');
    };

    await expect(client.mutate('todo.updateMemo', {
      id: 'todo_1',
      memo: 'Must not survive',
    })).rejects.toThrow('Local persistence failed');

    expect(client.store.get('todo', 'todo_1')?.memo).toBe('');
    expect(client.sync.inspectQueue()).toEqual([]);
  });

  it('reconciles already-fetched remote data without an extra pull', async () => {
    const { client, transport } = await createClient();

    await client.sync.reconcile([{
      entity: 'todo',
      id: 'todo_1',
      op: 'upsert',
      data: {
        id: 'todo_1',
        title: 'Existing remote todo',
        memo: '',
        status: 'pending',
      },
    }]);

    expect(client.store.get('todo', 'todo_1')?.title).toBe('Existing remote todo');
    expect(transport.pulls).toEqual([]);
  });

  it('reconciles an authoritative snapshot and deletes only missing records in scope', async () => {
    const { client } = await createClient();
    await client.sync.reconcile([
      {
        entity: 'todo',
        id: 'project_a_keep',
        op: 'upsert',
        data: { id: 'project_a_keep', title: 'Keep', projectId: 'project_a' },
      },
      {
        entity: 'todo',
        id: 'project_a_remove',
        op: 'upsert',
        data: { id: 'project_a_remove', title: 'Remove', projectId: 'project_a' },
      },
      {
        entity: 'todo',
        id: 'project_b_keep',
        op: 'upsert',
        data: { id: 'project_b_keep', title: 'Other project', projectId: 'project_b' },
      },
    ]);

    await client.sync.reconcileSnapshot('todo', [{
      id: 'project_a_keep',
      title: 'Remote title',
      projectId: 'project_a',
    }], {
      deleteMissing: true,
      includeLocal: (record) => record.projectId === 'project_a',
    });

    expect(client.store.get('todo', 'project_a_keep')?.title).toBe('Remote title');
    expect(client.store.get('todo', 'project_a_remove')).toBeUndefined();
    expect(client.store.get('todo', 'project_b_keep')?.title).toBe('Other project');
  });

  it('restores local entities and failed queue state after restart', async () => {
    const storage = new MemoryStorageAdapter();
    const transport = new TestTransport();
    transport.online = false;
    const first = await createClient(storage, transport);
    await first.client.mutate('todo.create', { id: 'todo_1', title: 'Survives restart' });

    await expect(first.client.sync.push()).rejects.toThrow('local data remains queued');
    expect(first.client.getEntitySyncState('todo', 'todo_1')).toBe('failed');

    const second = await createClient(storage, transport);
    expect(second.client.store.get('todo', 'todo_1')?.title).toBe('Survives restart');
    expect(second.client.getEntitySyncState('todo', 'todo_1')).toBe('failed');

    transport.online = true;
    await second.client.sync.retry();
    expect(second.client.getEntitySyncState('todo', 'todo_1')).toBe('clean');
  });

  it('pushes repeated mutations in creation order', async () => {
    const { client, transport } = await createClient();
    await client.mutate('todo.create', { id: 'todo_1', title: 'Ordered' });
    await client.mutate('todo.updateMemo', { id: 'todo_1', memo: 'First edit' });
    await client.mutate('todo.updateMemo', { id: 'todo_1', memo: 'Second edit' });

    await client.sync.push();

    expect(transport.pushes[0].mutations.map((mutation) => mutation.name)).toEqual([
      'todo.create',
      'todo.updateMemo',
      'todo.updateMemo',
    ]);
    expect(client.sync.inspectQueue()).toEqual([]);
  });

  it('does not let an older in-flight response overwrite a newer local edit', async () => {
    const storage = new MemoryStorageAdapter();
    let releasePush: ((value: {
      ackedMutationIds: string[];
      deltas: Array<{
        entity: string;
        id: string;
        op: 'upsert';
        data: { id: string; title: string; memo: string; status: string };
      }>;
    }) => void) | undefined;
    const transport = new TestTransport();
    const first = await createClient(storage, transport);
    await first.client.mutate('todo.create', { id: 'todo_1', title: 'Concurrent' });
    await first.client.sync.push();
    transport.push = async (request) => new Promise((resolve) => {
      releasePush = resolve;
      transport.pushes.push(structuredClone(request));
    });

    await first.client.mutate('todo.updateMemo', { id: 'todo_1', memo: 'Older edit' });
    const pushing = first.client.sync.push();
    await Promise.resolve();
    await first.client.mutate('todo.updateMemo', { id: 'todo_1', memo: 'Newer edit' });
    const inFlightId = transport.pushes.at(-1)?.mutations[0].id;
    if (!inFlightId || !releasePush) throw new Error('Expected an in-flight mutation.');
    releasePush({
      ackedMutationIds: [inFlightId],
      deltas: [{
        entity: 'todo',
        id: 'todo_1',
        op: 'upsert',
        data: {
          id: 'todo_1',
          title: 'Concurrent',
          memo: 'Older edit',
          status: 'pending',
        },
      }],
    });
    await pushing;

    expect(first.client.store.get('todo', 'todo_1')?.memo).toBe('Newer edit');
    expect(first.client.getEntitySyncState('todo', 'todo_1')).toBe('queued');
  });

  it('does not let earlier deltas in one acknowledged batch overwrite later queued edits', async () => {
    const { client, transport } = await createClient();
    await client.mutate('todo.create', { id: 'todo_1', title: 'Local title' });
    await client.mutate('todo.updateMemo', { id: 'todo_1', memo: 'Latest local memo' });
    const mutationIds = client.sync.inspectQueue().map((mutation) => mutation.id);
    transport.push = async (request) => ({
      ackedMutationIds: request.mutations.map((mutation) => mutation.id),
      deltas: [
        {
          entity: 'todo',
          id: 'todo_1',
          op: 'upsert',
          data: {
            id: 'todo_1',
            title: 'Local title',
            memo: '',
            status: 'pending',
          },
        },
        {
          entity: 'todo',
          id: 'todo_1',
          op: 'patch',
          patch: { memo: 'Latest local memo' },
        },
      ],
    });

    await client.sync.push();

    expect(mutationIds).toHaveLength(2);
    expect(client.store.get('todo', 'todo_1')?.memo).toBe('Latest local memo');
    expect(client.sync.inspectQueue()).toEqual([]);
  });

  it('protects dirty draft fields while accepting remote fields', async () => {
    const { client, transport } = await createClient();
    await client.mutate('todo.create', { id: 'todo_1', title: 'Local title' });
    transport.pullDeltas = [{
      entity: 'todo',
      id: 'todo_1',
      op: 'upsert',
      data: {
        id: 'todo_1',
        title: 'Old remote title',
        memo: 'Old remote memo',
        status: 'completed',
      },
    }];

    await client.sync.pull();

    expect(client.store.get('todo', 'todo_1')).toEqual({
      id: 'todo_1',
      title: 'Local title',
      memo: '',
      status: 'completed',
    });
  });

  it('does not apply a remote delete over protected local dirty fields', async () => {
    const { client, transport } = await createClient();
    await client.mutate('todo.create', { id: 'todo_1', title: 'Keep me' });
    transport.pullDeltas = [{ entity: 'todo', id: 'todo_1', op: 'delete' }];

    await client.sync.pull();

    expect(client.store.get('todo', 'todo_1')?.title).toBe('Keep me');
  });

  it('keeps a pending local delete as a tombstone against stale remote upserts', async () => {
    const { client, transport } = await createClient();
    await client.mutate('todo.create', { id: 'todo_1', title: 'Delete me' });
    await client.sync.push();
    await client.mutate('todo.delete', { id: 'todo_1' });
    transport.pullDeltas = [{
      entity: 'todo',
      id: 'todo_1',
      op: 'upsert',
      data: {
        id: 'todo_1',
        title: 'Stale server copy',
        memo: '',
        status: 'pending',
      },
    }];

    await client.sync.pull();

    expect(client.store.get('todo', 'todo_1')).toBeUndefined();
    expect(client.getEntitySyncState('todo', 'todo_1')).toBe('queued');
  });

  it('supports custom manual conflict policies with actionable state', async () => {
    const storage = new MemoryStorageAdapter();
    const transport = new TestTransport();
    const manualSchema = defineSchema({
      entities: { todo: { conflict: 'askDeveloper' } },
    });
    const client = await SyncClient.create({
      clientId: 'manual-client',
      schema: manualSchema,
      mutations,
      storage,
      transport,
      id: sequentialIds('manual'),
      conflictPolicies: {
        askDeveloper: ({ local }) => ({
          action: 'manual',
          value: local,
          reason: 'Product-specific merge required.',
        }),
      },
    });
    await client.mutate('todo.create', { id: 'todo_1', title: 'Local' });
    transport.pullDeltas = [{
      entity: 'todo',
      id: 'todo_1',
      op: 'upsert',
      data: { id: 'todo_1', title: 'Remote' },
    }];

    await client.sync.pull();

    expect(client.getEntitySyncState('todo', 'todo_1')).toBe('conflicted');
    expect(client.sync.inspectQueue()[0].error).toBe('Product-specific merge required.');
  });

  it('persists and reuses the pull cursor', async () => {
    const storage = new MemoryStorageAdapter();
    const firstTransport = new TestTransport();
    const first = await createClient(storage, firstTransport);
    await first.client.sync.pull();

    const secondTransport = new TestTransport();
    const second = await createClient(storage, secondTransport);
    await second.client.sync.pull();

    expect(secondTransport.pulls[0].cursor).toBe(1);
  });

  it('emits observable status and mutation events', async () => {
    const { client } = await createClient();
    const eventTypes: string[] = [];
    const unsubscribe = client.sync.subscribe((event) => eventTypes.push(event.type));

    await client.mutate('todo.create', { id: 'todo_1', title: 'Observable' });
    await client.sync.push();
    unsubscribe();

    expect(eventTypes).toContain('mutation-enqueued');
    expect(eventTypes).toContain('mutation-acked');
    expect(client.sync.status()).toMatchObject({
      phase: 'idle',
      pendingCount: 0,
      failedCount: 0,
    });
  });
});
