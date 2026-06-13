import type {
  EntitySnapshot,
  MutationRecord,
  PullRequest,
  PullResult,
  PushRequest,
  PushResult,
  RemoteDelta,
  SyncTransport,
} from '../../packages/core/src/index';

export class FakeTodoTransport implements SyncTransport {
  private server: EntitySnapshot = {};
  private deltas: RemoteDelta[] = [];
  private cursor = 0;

  async push(request: PushRequest): Promise<PushResult> {
    const ackedMutationIds: string[] = [];

    for (const mutation of request.mutations) {
      this.applyMutation(mutation);
      ackedMutationIds.push(mutation.id);
    }

    return {
      ackedMutationIds,
      deltas: this.deltas.splice(0),
    };
  }

  async pull(_request: PullRequest): Promise<PullResult> {
    return {
      cursor: this.cursor,
      deltas: this.deltas.splice(0),
    };
  }

  snapshot(): EntitySnapshot {
    return structuredClone(this.server);
  }

  private applyMutation(mutation: MutationRecord): void {
    if (mutation.name === 'todo.create') {
      const input = mutation.input as { id: string; title: string };
      this.upsert('todo', {
        id: input.id,
        title: input.title,
        memo: '',
        status: 'pending',
      });
    }

    if (mutation.name === 'todo.updateTitle') {
      const input = mutation.input as { id: string; title: string };
      this.patch('todo', input.id, { title: input.title });
    }

    if (mutation.name === 'todo.updateMemo') {
      const input = mutation.input as { id: string; memo: string };
      this.patch('todo', input.id, { memo: input.memo });
    }

    if (mutation.name === 'todo.addSubTask') {
      const input = mutation.input as { id: string; todoId: string; title: string };
      this.upsert('subTask', {
        id: input.id,
        todoId: input.todoId,
        title: input.title,
        done: false,
      });
    }
  }

  private upsert(entity: string, record: any): void {
    this.server[entity] = { ...(this.server[entity] || {}), [record.id]: record };
    this.deltas.push({ entity, id: record.id, op: 'upsert', data: record, version: ++this.cursor });
  }

  private patch(entity: string, id: string, patch: Record<string, unknown>): void {
    const current = this.server[entity]?.[id] || { id };
    const next = { ...current, ...patch, id };
    this.upsert(entity, next);
  }
}
