import type {
  EntityRecord,
  MutationRecord,
  PullRequest,
  PullResult,
  PushRequest,
  PushResult,
  RemoteDelta,
  SyncTransport,
} from '../../packages/core/src/index';

type FetchLike = typeof fetch;

type AddioTodo = EntityRecord & {
  taskSummary?: string;
  memoContent?: string;
  memoBlocks?: unknown[];
  status?: string;
  priority?: string;
  projectId?: string | null;
  updatedAt?: string | null;
  subTasks?: Array<{
    id: string;
    description: string;
    status: string;
    index: number;
  }>;
};

export class AddioTodoRestTransport implements SyncTransport {
  private readonly todoIds: Set<string>;

  constructor(
    todoIds: Iterable<string>,
    private readonly options: {
      baseUrl?: string;
      fetch?: FetchLike;
    } = {},
  ) {
    this.todoIds = new Set(todoIds);
  }

  async push(request: PushRequest): Promise<PushResult> {
    const ackedMutationIds: string[] = [];
    const rejected: NonNullable<PushResult['rejected']> = [];
    const deltas: RemoteDelta[] = [];

    for (const mutation of request.mutations) {
      try {
        if (mutation.name.startsWith('canvasCard.')) {
          deltas.push(...await this.sendCanvasCardMutation(mutation));
          ackedMutationIds.push(mutation.id);
          continue;
        }
        if (mutation.name.startsWith('think.')) {
          deltas.push(...await this.sendThinkMutation(mutation));
          ackedMutationIds.push(mutation.id);
          continue;
        }
        const todo = await this.sendMutation(mutation);
        ackedMutationIds.push(mutation.id);
        if (mutation.name === 'todo.delete') {
          const input = mutation.input as { id: string };
          deltas.push({ entity: 'todo', id: input.id, op: 'delete' });
        } else if (todo) {
          const delta = this.todoMutationToDelta(mutation, todo);
          if (delta) deltas.push(delta);
        }
      } catch (error) {
        rejected.push({
          mutationId: mutation.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { ackedMutationIds, rejected, deltas };
  }

  private async sendThinkMutation(mutation: MutationRecord): Promise<RemoteDelta[]> {
    const input = mutation.input as Record<string, unknown>;
    if (mutation.name === 'think.create') {
      const think = await this.request<EntityRecord>('/api/thinks', {
        method: 'POST',
        body: input.think,
      });
      return [{ entity: 'think', id: String(think.id), op: 'upsert', data: think }];
    }
    if (mutation.name === 'think.update') {
      const think = await this.request<EntityRecord>(`/api/thinks/${input.id}`, {
        method: 'PATCH',
        body: input.patch,
      });
      const patch: Record<string, unknown> = {};
      for (const field of Object.keys(input.patch as Record<string, unknown>)) {
        if (think[field] !== undefined) patch[field] = think[field];
      }
      return [{ entity: 'think', id: String(input.id), op: 'patch', patch }];
    }
    if (mutation.name === 'think.delete') {
      await this.request(`/api/thinks/${input.id}`, { method: 'DELETE' });
      return [{ entity: 'think', id: String(input.id), op: 'delete' }];
    }
    throw new Error(
      `AddioTodoRestTransport cannot map mutation "${mutation.name}". `
      + 'Add an explicit REST mapping before using it.',
    );
  }

  private async sendCanvasCardMutation(mutation: MutationRecord): Promise<RemoteDelta[]> {
    const input = mutation.input as Record<string, unknown>;
    if (mutation.name === 'canvasCard.attach') {
      const card = input.card as EntityRecord & {
        canvasId: string;
        type: string;
        refId: string;
        position: number;
      };
      await this.request(`/api/canvases/${card.canvasId}/cards`, {
        method: 'POST',
        body: {
          cardId: card.id,
          type: card.type,
          refId: card.refId,
          position: card.position,
        },
      });
      return [{ entity: 'canvasCard', id: String(card.id), op: 'upsert', data: card }];
    }
    if (mutation.name === 'canvasCard.detach') {
      await this.request(`/api/canvases/${input.canvasId}/cards/${input.id}`, {
        method: 'DELETE',
      });
      return [{ entity: 'canvasCard', id: String(input.id), op: 'delete' }];
    }
    if (mutation.name === 'canvasCard.reorder') {
      const orderedCardIds = input.orderedCardIds as string[];
      await this.request(`/api/canvases/${input.canvasId}/cards/reorder`, {
        method: 'PATCH',
        body: { orderedCardIds },
      });
      return orderedCardIds.map((id, position) => ({
        entity: 'canvasCard',
        id,
        op: 'patch',
        patch: { position },
      }));
    }
    throw new Error(
      `AddioTodoRestTransport cannot map mutation "${mutation.name}". `
      + 'Add an explicit REST mapping before using it.',
    );
  }

  async pull(_request: PullRequest): Promise<PullResult> {
    const deltas: RemoteDelta[] = [];
    for (const todoId of this.todoIds) {
      const todo = await this.request<AddioTodo>(`/api/todos/${todoId}`);
      deltas.push(...this.todoToDeltas(todo));
    }
    return { cursor: Date.now(), deltas };
  }

  private async sendMutation(mutation: MutationRecord): Promise<AddioTodo | null> {
    const input = mutation.input as Record<string, unknown>;
    const todoId = String(input.id || (input.todo as { id?: string } | undefined)?.id);
    this.todoIds.add(todoId);

    switch (mutation.name) {
      case 'todo.create':
        return this.request('/api/todos', {
          method: 'POST',
          body: input.todo,
        });
      case 'todo.updateTitle':
        return this.request(`/api/todos/${input.id}`, {
          method: 'PATCH',
          body: { taskSummary: input.taskSummary },
        });
      case 'todo.updateMemo':
        return this.request(`/api/todos/${input.id}`, {
          method: 'PATCH',
          body: input.patch,
        });
      case 'todo.updateStatus':
        return this.request(`/api/todos/${input.id}/status`, {
          method: 'PATCH',
          body: { status: input.status },
        });
      case 'todo.updatePriority':
        return this.request(`/api/todos/${input.id}`, {
          method: 'PATCH',
          body: { priority: input.priority },
        });
      case 'todo.moveProject':
        return this.request(`/api/todos/${input.id}`, {
          method: 'PATCH',
          body: { projectId: input.projectId },
        });
      case 'todo.addSubTask':
        return this.request(`/api/todos/${input.id}/subtasks`, {
          method: 'POST',
          body: input.subTask,
        });
      case 'todo.updateSubTask':
        return this.request(`/api/todos/${input.id}/subtasks/${input.subTaskId}`, {
          method: 'PATCH',
          body: input.patch,
        });
      case 'todo.deleteSubTask':
        return this.request(`/api/todos/${input.id}/subtasks/${input.subTaskId}`, {
          method: 'DELETE',
        });
      case 'todo.reorderSubTasks':
        return this.request(`/api/todos/${input.id}/subtasks/reorder`, {
          method: 'PATCH',
          body: { ids: input.ids },
        });
      case 'todo.replaceSubTasks':
        return this.request(`/api/todos/${input.id}`, {
          method: 'PATCH',
          body: { subTasks: input.subTasks },
        });
      case 'todo.delete':
        await this.request(`/api/todos/${input.id}`, { method: 'DELETE' });
        return null;
      default:
        throw new Error(
          `AddioTodoRestTransport cannot map mutation "${mutation.name}". `
          + 'Add an explicit REST mapping before using it.',
        );
    }
  }

  private todoToDeltas(todo: AddioTodo): RemoteDelta[] {
    const todoId = String(todo.id);
    return [{
      entity: 'todo',
      id: todoId,
      op: 'upsert',
      data: {
        id: todoId,
        taskSummary: todo.taskSummary || '',
        memoContent: todo.memoContent || '',
        memoBlocks: todo.memoBlocks || [],
        status: todo.status || 'pending',
        priority: todo.priority || 'none',
        projectId: todo.projectId || null,
        subTasks: todo.subTasks || [],
        updatedAt: todo.updatedAt || null,
      },
      version: todo.updatedAt || undefined,
    }];
  }

  private todoMutationToDelta(
    mutation: MutationRecord,
    todo: AddioTodo,
  ): RemoteDelta | null {
    const fieldsByMutation: Record<string, string[]> = {
      'todo.updateTitle': ['taskSummary'],
      'todo.updateMemo': ['memoContent', 'memoBlocks'],
      'todo.updateStatus': ['status', 'subTasks'],
      'todo.updatePriority': ['priority'],
      'todo.moveProject': ['projectId'],
      'todo.addSubTask': ['subTasks', 'status'],
      'todo.updateSubTask': ['subTasks', 'status'],
      'todo.deleteSubTask': ['subTasks', 'status'],
      'todo.reorderSubTasks': ['subTasks'],
      'todo.replaceSubTasks': ['subTasks', 'status'],
    };
    const fields = fieldsByMutation[mutation.name];
    if (!fields) return this.todoToDeltas(todo)[0] || null;
    const patch: Record<string, unknown> = {};
    for (const field of fields) {
      if (todo[field] !== undefined) patch[field] = todo[field];
    }
    return {
      entity: 'todo',
      id: String(todo.id),
      op: 'patch',
      patch,
      version: todo.updatedAt || undefined,
    };
  }

  private async request<T>(path: string, init: {
    method?: string;
    body?: unknown;
  } = {}): Promise<T> {
    const fetcher = this.options.fetch || globalThis.fetch;
    if (!fetcher) throw new Error('Fetch is unavailable for AddioTodoRestTransport.');
    const response = await fetcher(`${this.options.baseUrl || ''}${path}`, {
      method: init.method || 'GET',
      credentials: 'include',
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const payload = await response.json() as {
      success?: boolean;
      data?: T;
      message?: string;
    };
    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || `Addio request failed with status ${response.status}.`);
    }
    return (payload.data ?? payload) as T;
  }
}
