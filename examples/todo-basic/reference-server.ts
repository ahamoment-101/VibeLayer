import type {
  EntityRecord,
  EntitySnapshot,
  MutationRecord,
  PullRequest,
  PullResult,
  PushRequest,
  PushResult,
  RemoteDelta,
} from '../../packages/core/src/index';

type ProcessedMutation = {
  mutationId: string;
  deltas: RemoteDelta[];
};

export class TodoReferenceServer {
  private entities: EntitySnapshot = {};
  private changeLog: RemoteDelta[] = [];
  private processedByClient = new Map<string, Map<string, ProcessedMutation>>();
  private version = 0;

  push(request: PushRequest): PushResult {
    const ackedMutationIds: string[] = [];
    const rejected: NonNullable<PushResult['rejected']> = [];
    const deltas: RemoteDelta[] = [];
    const processed = this.processedFor(request.clientId);

    for (const mutation of request.mutations) {
      const previous = processed.get(mutation.id);
      if (previous) {
        ackedMutationIds.push(mutation.id);
        deltas.push(...previous.deltas);
        continue;
      }

      try {
        // In production, commit the business write, processed mutation id, and
        // change-log row in one database transaction.
        const mutationDeltas = this.applyMutation(mutation);
        processed.set(mutation.id, {
          mutationId: mutation.id,
          deltas: mutationDeltas,
        });
        ackedMutationIds.push(mutation.id);
        deltas.push(...mutationDeltas);
      } catch (error) {
        rejected.push({
          mutationId: mutation.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { ackedMutationIds, rejected, deltas };
  }

  pull(request: PullRequest): PullResult {
    const cursor = this.parseCursor(request.cursor);
    const deltas = this.changeLog.filter((delta) => Number(delta.version || 0) > cursor);
    const nextCursor = deltas.length
      ? Number(deltas.at(-1)?.version || cursor)
      : this.version;

    return {
      cursor: nextCursor,
      deltas: structuredClone(deltas),
    };
  }

  snapshot(): EntitySnapshot {
    return structuredClone(this.entities);
  }

  processedMutationCount(clientId: string): number {
    return this.processedByClient.get(clientId)?.size || 0;
  }

  private processedFor(clientId: string): Map<string, ProcessedMutation> {
    const existing = this.processedByClient.get(clientId);
    if (existing) return existing;
    const created = new Map<string, ProcessedMutation>();
    this.processedByClient.set(clientId, created);
    return created;
  }

  private parseCursor(cursor: PullRequest['cursor']): number {
    if (typeof cursor === 'number') return cursor;
    if (typeof cursor === 'string' && cursor) return Number(cursor) || 0;
    return 0;
  }

  private applyMutation(mutation: MutationRecord): RemoteDelta[] {
    if (mutation.name === 'todo.create') {
      const input = mutation.input as { id: string; title: string };
      this.assertId(input.id, mutation.name);
      return [this.upsert('todo', {
        id: input.id,
        title: input.title,
        memo: '',
        status: 'pending',
      })];
    }

    if (mutation.name === 'todo.updateTitle') {
      const input = mutation.input as { id: string; title: string };
      this.assertExisting('todo', input.id, mutation.name);
      return [this.patch('todo', input.id, { title: input.title })];
    }

    if (mutation.name === 'todo.updateMemo') {
      const input = mutation.input as { id: string; memo: string };
      this.assertExisting('todo', input.id, mutation.name);
      return [this.patch('todo', input.id, { memo: input.memo })];
    }

    if (mutation.name === 'todo.addSubTask') {
      const input = mutation.input as { id: string; todoId: string; title: string };
      this.assertId(input.id, mutation.name);
      this.assertExisting('todo', input.todoId, mutation.name);
      return [this.upsert('subTask', {
        id: input.id,
        todoId: input.todoId,
        title: input.title,
        done: false,
      })];
    }

    throw new Error(`Unsupported mutation: ${mutation.name}`);
  }

  private upsert(entity: string, record: EntityRecord): RemoteDelta {
    const canonical = structuredClone(record);
    this.entities[entity] = {
      ...(this.entities[entity] || {}),
      [canonical.id]: canonical,
    };
    return this.appendDelta({
      entity,
      id: canonical.id,
      op: 'upsert',
      data: canonical,
    });
  }

  private patch(entity: string, id: string, patch: Record<string, unknown>): RemoteDelta {
    const current = this.entities[entity]?.[id];
    if (!current) throw new Error(`Cannot patch missing ${entity}:${id}.`);
    const next = { ...current, ...patch, id };
    this.entities[entity] = {
      ...(this.entities[entity] || {}),
      [id]: next,
    };
    return this.appendDelta({
      entity,
      id,
      op: 'patch',
      patch: structuredClone(patch),
    });
  }

  private appendDelta(delta: Omit<RemoteDelta, 'version'>): RemoteDelta {
    const versioned = { ...delta, version: ++this.version };
    this.changeLog.push(versioned);
    return structuredClone(versioned);
  }

  private assertId(id: string | undefined, mutationName: string): void {
    if (!id) throw new Error(`${mutationName} requires a client-generated id.`);
  }

  private assertExisting(entity: string, id: string | undefined, mutationName: string): void {
    if (!id) throw new Error(`${mutationName} requires a client-generated id.`);
    if (!this.entities[entity]?.[id]) {
      throw new Error(`${mutationName} cannot target missing ${entity}:${id}.`);
    }
  }
}
