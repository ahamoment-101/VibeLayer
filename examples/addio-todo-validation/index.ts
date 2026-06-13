import {
  MemoryStorageAdapter,
  SyncClient,
} from '../../packages/core/src/index';
import { addioTodoMutations } from './mutations';
import { addioTodoSchema } from './schema';
import { AddioTodoRestTransport } from './transport';

async function main(): Promise<void> {
  const storage = new MemoryStorageAdapter();

  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  const transport = new AddioTodoRestTransport(['todo_1'], {
    fetch: async (input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({
        url: String(input),
        method: init?.method || 'GET',
        body,
      });
      return new Response(JSON.stringify({
        success: true,
        data: {
          id: body?.id || 'todo_1',
          taskSummary: body?.taskSummary || 'Created offline first',
          userInput: body?.userInput || 'Created offline first',
          memoContent: body?.memoContent || 'Draft written locally first',
          memoBlocks: [],
          status: 'pending',
          priority: 'none',
          subTasks: [],
          updatedAt: '2026-06-11T00:00:00.000Z',
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  let mutationIndex = 0;
  const client = await SyncClient.create({
    clientId: 'addio-validation',
    schema: addioTodoSchema,
    mutations: addioTodoMutations,
    storage,
    transport,
    id: () => `mutation_${++mutationIndex}`,
  });

  await client.mutate('todo.create', {
    todo: {
      id: 'todo_1',
      taskSummary: 'Created offline first',
      userInput: 'Created offline first',
      memoContent: '',
      memoBlocks: [],
      status: 'pending',
      priority: 'none',
      subTasks: [],
    },
  });
  await client.mutate('todo.updateMemo', {
    id: 'todo_1',
    patch: { memoContent: 'Draft written locally first' },
  });
  console.log('before network', client.inspect());
  await client.sync.push();
  console.log('mapped Addio requests', requests);
  console.log('after sync', client.inspect());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
