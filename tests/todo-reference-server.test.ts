import { describe, expect, it } from 'vitest';
import {
  MemoryStorageAdapter,
  SyncClient,
  type PushRequest,
  type PushResult,
  type SyncTransport,
} from 'vibelayer';
import { FakeTodoTransport } from '../examples/todo-basic/fake-transport';
import { mutations } from '../examples/todo-basic/mutations';
import { TodoReferenceServer } from '../examples/todo-basic/reference-server';
import { schema } from '../examples/todo-basic/schema';
import { sequentialIds } from './helpers';

class DropAckAfterCommitTransport implements SyncTransport {
  dropNextAck = false;

  constructor(private readonly server: TodoReferenceServer) {}

  async push(request: PushRequest): Promise<PushResult> {
    const result = this.server.push(request);
    if (this.dropNextAck) {
      this.dropNextAck = false;
      throw new Error('response lost after commit');
    }
    return result;
  }
}

async function createTodoClient(transport: SyncTransport) {
  return SyncClient.create({
    clientId: 'reference-client',
    schema,
    mutations,
    storage: new MemoryStorageAdapter(),
    transport,
    id: sequentialIds('mutation'),
  });
}

describe('Todo reference sync server', () => {
  it('does not duplicate a committed mutation when the first ack is lost', async () => {
    const server = new TodoReferenceServer();
    const transport = new DropAckAfterCommitTransport(server);
    const client = await createTodoClient(transport);

    await client.mutate('todo.create', {
      id: 'todo_1',
      title: 'Committed before ack',
    });

    transport.dropNextAck = true;
    await expect(client.sync.push()).rejects.toThrow('response lost after commit');
    expect(client.getEntitySyncState('todo', 'todo_1')).toBe('failed');
    expect(server.snapshot().todo.todo_1.title).toBe('Committed before ack');
    expect(server.processedMutationCount('reference-client')).toBe(1);

    await client.sync.retry();

    expect(client.getEntitySyncState('todo', 'todo_1')).toBe('clean');
    expect(Object.keys(server.snapshot().todo)).toEqual(['todo_1']);
    expect(server.processedMutationCount('reference-client')).toBe(1);
  });

  it('replays changes by cursor without resending old deltas', async () => {
    const server = new TodoReferenceServer();
    const transport = new FakeTodoTransport(server);
    const client = await createTodoClient(transport);

    await client.mutate('todo.create', { id: 'todo_1', title: 'Cursor safe' });
    await client.sync.push();

    const firstPull = await transport.pull({ clientId: 'reference-client', cursor: null });
    const secondPull = await transport.pull({
      clientId: 'reference-client',
      cursor: firstPull.cursor,
    });

    expect(firstPull.deltas).toHaveLength(1);
    expect(firstPull.deltas[0]).toMatchObject({
      entity: 'todo',
      id: 'todo_1',
      op: 'upsert',
    });
    expect(secondPull.deltas).toEqual([]);
    expect(secondPull.cursor).toBe(firstPull.cursor);
  });

  it('rejects dependent writes until their parent entity exists', async () => {
    const server = new TodoReferenceServer();
    const result = server.push({
      clientId: 'reference-client',
      mutations: [{
        id: 'mutation_1',
        name: 'todo.addSubTask',
        input: { id: 'sub_1', todoId: 'missing_todo', title: 'Blocked' },
        status: 'queued',
        createdAt: 1,
        updatedAt: 1,
        attempts: 0,
        affects: ['subTask'],
        effects: [],
      }],
    });

    expect(result.ackedMutationIds).toEqual([]);
    expect(result.rejected?.[0]).toMatchObject({
      mutationId: 'mutation_1',
      error: 'todo.addSubTask cannot target missing todo:missing_todo.',
    });
    expect(server.snapshot().subTask).toBeUndefined();
  });
});
