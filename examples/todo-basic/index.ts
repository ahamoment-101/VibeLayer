import { MemoryStorageAdapter, SyncClient } from '../../packages/core/src/index';
import { FakeTodoTransport } from './fake-transport';
import { mutations } from './mutations';
import { schema } from './schema';

async function main(): Promise<void> {
  const storage = new MemoryStorageAdapter();
  const transport = new FakeTodoTransport();
  const client = await SyncClient.create({
    clientId: 'example-client',
    schema,
    mutations,
    storage,
    transport,
    id: (() => {
      let index = 0;
      return () => `local_${++index}`;
    })(),
  });

  await client.mutate('todo.create', { id: 'todo_1', title: 'Draft SDK architecture' });
  await client.mutate('todo.updateMemo', { id: 'todo_1', memo: 'Local memo is durable before sync.' });
  await client.mutate('todo.addSubTask', { id: 'sub_1', todoId: 'todo_1', title: 'Write RFC' });

  console.log('local before sync', client.store.getSnapshot());

  await client.sync.push();

  console.log('local after sync', client.store.getSnapshot());
  console.log('server', transport.snapshot());
}

main().catch((error) => {
  console.error(error);
});
