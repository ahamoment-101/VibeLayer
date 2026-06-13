import { describe, expect, it } from 'vitest';
import {
  MemoryStorageAdapter,
  SyncClient,
  createAgentContract,
} from '../packages/core/src/index';
import { addioTodoMutations } from '../examples/addio-todo-validation/mutations';
import { addioTodoSchema } from '../examples/addio-todo-validation/schema';
import { AddioTodoRestTransport } from '../examples/addio-todo-validation/transport';
import { sequentialIds } from './helpers';

describe('Addio public API validation', () => {
  it('maps SDK mutations to the existing Todo REST boundary', async () => {
    const requests: Array<{ url: string; method: string; body?: any }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url: String(input), method: init?.method || 'GET', body });
      return new Response(JSON.stringify({
        success: true,
        data: {
          id: String(input) === '/api/todos' ? body.id : 'todo_1',
          taskSummary: body?.taskSummary || 'Todo',
          memoContent: body?.memoContent || '',
          memoBlocks: [],
          status: 'pending',
          priority: 'none',
          subTasks: body?.id ? [{
            id: body.id,
            key: body.key,
            description: body.description,
            status: 'pending',
            index: 0,
          }] : [],
          updatedAt: '2026-06-11T00:00:00.000Z',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const storage = new MemoryStorageAdapter();
    await storage.saveEntities({
      todo: {
        todo_1: {
          id: 'todo_1',
          taskSummary: 'Todo',
          memoContent: '',
          memoBlocks: [],
          status: 'pending',
          priority: 'none',
        },
      },
    });
    const client = await SyncClient.create({
      clientId: 'addio-test',
      schema: addioTodoSchema,
      mutations: addioTodoMutations,
      storage,
      transport: new AddioTodoRestTransport(['todo_1'], { fetch: fetcher }),
      id: sequentialIds('mutation'),
    });

    await client.mutate('todo.create', {
      todo: {
        id: 'todo_client_created',
        taskSummary: 'Created locally',
        userInput: 'Created locally',
        memoContent: '',
        memoBlocks: [],
        status: 'pending',
        priority: 'none',
        subTasks: [],
      },
    });
    await client.mutate('todo.updateMemo', {
      id: 'todo_1',
      patch: { memoContent: 'Durable draft' },
    });
    await client.mutate('todo.addSubTask', {
      id: 'todo_1',
      subTask: {
        id: 'sub_client_1',
        key: 'sub_client_1',
        description: 'Stable client id',
        status: 'pending',
        index: 0,
      },
    });
    await client.sync.push();

    expect(requests).toEqual([
      {
        url: '/api/todos',
        method: 'POST',
        body: {
          id: 'todo_client_created',
          taskSummary: 'Created locally',
          userInput: 'Created locally',
          memoContent: '',
          memoBlocks: [],
          status: 'pending',
          priority: 'none',
          subTasks: [],
        },
      },
      {
        url: '/api/todos/todo_1',
        method: 'PATCH',
        body: { memoContent: 'Durable draft' },
      },
      {
        url: '/api/todos/todo_1/subtasks',
        method: 'POST',
        body: {
          id: 'sub_client_1',
          key: 'sub_client_1',
          description: 'Stable client id',
          status: 'pending',
          index: 0,
        },
      },
    ]);
    expect(client.getEntitySyncState('todo', 'todo_1')).toBe('clean');
    expect(client.store.get('todo', 'todo_1')?.subTasks).toEqual([{
      id: 'sub_client_1',
      key: 'sub_client_1',
      description: 'Stable client id',
      status: 'pending',
      index: 0,
    }]);
  });

  it('generates an Agent-readable contract from schema and mutation metadata', () => {
    const contract = createAgentContract(addioTodoSchema, addioTodoMutations);

    expect(contract.protocolVersion).toBe(1);
    expect(contract.entities.find((entity) => entity.name === 'todo')?.fields)
      .toContainEqual(expect.objectContaining({
        name: 'memoContent',
        durableDraft: true,
        conflict: 'localDirtyWins',
      }));
    expect(contract.mutations.find((mutation) => mutation.name === 'todo.updateMemo'))
      .toMatchObject({
        description: 'Update Addio memo fields locally before network sync.',
        affects: ['todo.memoContent', 'todo.memoBlocks'],
      });
    expect(contract.mutations.find((mutation) => mutation.name === 'todo.create'))
      .toMatchObject({
        description: 'Create an Addio Todo locally with a stable client-generated id.',
        affects: ['todo'],
      });
    expect(contract.entities.find((entity) => entity.name === 'canvasCard')?.fields)
      .toContainEqual(expect.objectContaining({
        name: 'position',
        durableDraft: true,
        conflict: 'localDirtyWins',
      }));
    expect(contract.mutations.find((mutation) => mutation.name === 'canvasCard.attach'))
      .toMatchObject({
        description: 'Attach an item to a Canvas locally with a stable card id.',
        affects: ['canvasCard'],
      });
    expect(contract.entities.find((entity) => entity.name === 'think')?.fields)
      .toContainEqual(expect.objectContaining({
        name: 'pages',
        durableDraft: true,
        conflict: 'localDirtyWins',
      }));
    expect(contract.mutations.find((mutation) => mutation.name === 'think.update'))
      .toMatchObject({
        affects: ['think.title', 'think.content', 'think.pages', 'think.projectId'],
      });
  });
});
