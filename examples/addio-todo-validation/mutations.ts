import { defineMutations } from '../../packages/core/src/index';

type SubTask = {
  id: string;
  key?: string;
  description: string;
  status: 'pending' | 'completed';
  index: number;
};

export const addioTodoMutations = defineMutations({
  'todo.create': {
    description: 'Create an Addio Todo locally with a stable client-generated id.',
    affects: ['todo'],
    apply({ tx }, input: { todo: Record<string, unknown> & { id: string } }) {
      tx.upsert('todo', input.todo);
    },
  },
  'todo.updateTitle': {
    description: 'Update an Addio Todo title locally.',
    affects: ['todo.taskSummary'],
    apply({ tx }, input: { id: string; taskSummary: string }) {
      tx.patch('todo', input.id, { taskSummary: input.taskSummary });
    },
  },
  'todo.updateMemo': {
    description: 'Update Addio memo fields locally before network sync.',
    affects: ['todo.memoContent', 'todo.memoBlocks'],
    apply({ tx }, input: { id: string; patch: Record<string, unknown> }) {
      tx.patch('todo', input.id, input.patch);
    },
  },
  'todo.updateStatus': {
    description: 'Update Todo completion and derived subtask states.',
    affects: ['todo.status', 'todo.subTasks'],
    apply({ tx }, input: { id: string; status: 'pending' | 'completed' }) {
      const todo = tx.get('todo', input.id);
      const patch: Record<string, unknown> = { status: input.status };
      if (input.status === 'completed' && Array.isArray(todo?.subTasks)) {
        patch.subTasks = todo.subTasks.map((item) => ({ ...item, status: 'completed' }));
      }
      tx.patch('todo', input.id, patch);
    },
  },
  'todo.updatePriority': {
    description: 'Update Todo priority.',
    affects: ['todo.priority'],
    apply({ tx }, input: { id: string; priority: string }) {
      tx.patch('todo', input.id, { priority: input.priority });
    },
  },
  'todo.moveProject': {
    description: 'Move a Todo to another project.',
    affects: ['todo.projectId'],
    apply({ tx }, input: { id: string; projectId: string | null }) {
      tx.patch('todo', input.id, { projectId: input.projectId });
    },
  },
  'todo.addSubTask': {
    description: 'Add a stable client-generated subtask.',
    affects: ['todo.subTasks'],
    apply({ tx }, input: { id: string; subTask: SubTask }) {
      const todo = tx.get('todo', input.id);
      const subTasks = Array.isArray(todo?.subTasks) ? todo.subTasks : [];
      tx.patch('todo', input.id, { subTasks: [...subTasks, input.subTask] });
    },
  },
  'todo.updateSubTask': {
    description: 'Patch an existing subtask and derive parent status.',
    affects: ['todo.subTasks', 'todo.status'],
    apply({ tx }, input: { id: string; subTaskId: string; patch: Partial<SubTask> }) {
      const todo = tx.get('todo', input.id);
      const subTasks = Array.isArray(todo?.subTasks) ? todo.subTasks : [];
      tx.patch('todo', input.id, {
        subTasks: subTasks.map((item) => (
          (item as SubTask).id === input.subTaskId ? { ...item, ...input.patch } : item
        )),
      });
    },
  },
  'todo.deleteSubTask': {
    description: 'Delete and reindex a Todo subtask.',
    affects: ['todo.subTasks', 'todo.status'],
    apply({ tx }, input: { id: string; subTaskId: string }) {
      const todo = tx.get('todo', input.id);
      const subTasks = Array.isArray(todo?.subTasks) ? todo.subTasks as SubTask[] : [];
      tx.patch('todo', input.id, {
        subTasks: subTasks
          .filter((item) => item.id !== input.subTaskId)
          .map((item, index) => ({ ...item, index })),
      });
    },
  },
  'todo.reorderSubTasks': {
    description: 'Reorder Todo subtasks by stable id.',
    affects: ['todo.subTasks'],
    apply({ tx }, input: { id: string; ids: string[] }) {
      const todo = tx.get('todo', input.id);
      const byId = new Map(
        (Array.isArray(todo?.subTasks) ? todo.subTasks as SubTask[] : [])
          .map((item) => [item.id, item]),
      );
      tx.patch('todo', input.id, {
        subTasks: input.ids
          .map((id, index) => {
            const item = byId.get(id);
            return item ? { ...item, index } : null;
          })
          .filter(Boolean),
      });
    },
  },
  'todo.replaceSubTasks': {
    description: 'Replace the normalized Todo subtask collection.',
    affects: ['todo.subTasks'],
    apply({ tx }, input: { id: string; subTasks: SubTask[] }) {
      tx.patch('todo', input.id, { subTasks: input.subTasks });
    },
  },
  'todo.delete': {
    description: 'Delete a Todo locally and enqueue remote deletion.',
    affects: ['todo.__deleted'],
    apply({ tx }, input: { id: string }) {
      tx.delete('todo', input.id);
    },
  },
  'think.create': {
    description: 'Create an Addio Note locally with a stable client-generated id.',
    affects: ['think'],
    apply({ tx }, input: { think: Record<string, unknown> & { id: string } }) {
      tx.upsert('think', input.think);
    },
  },
  'think.update': {
    description: 'Patch Note title, document panels, content, or project locally.',
    affects: ['think.title', 'think.content', 'think.pages', 'think.projectId'],
    apply({ tx }, input: { id: string; patch: Record<string, unknown> }) {
      tx.patch('think', input.id, input.patch);
    },
  },
  'think.delete': {
    description: 'Delete a Note locally and enqueue idempotent remote deletion.',
    affects: ['think.__deleted'],
    apply({ tx }, input: { id: string }) {
      tx.delete('think', input.id);
    },
  },
  'canvasCard.attach': {
    description: 'Attach an item to a Canvas locally with a stable card id.',
    affects: ['canvasCard'],
    apply({ tx }, input: { card: Record<string, unknown> & { id: string } }) {
      tx.upsert('canvasCard', input.card);
    },
  },
  'canvasCard.detach': {
    description: 'Detach a Canvas card locally and enqueue idempotent remote removal.',
    affects: ['canvasCard.__deleted'],
    apply({ tx }, input: { id: string }) {
      tx.delete('canvasCard', input.id);
    },
  },
  'canvasCard.reorder': {
    description: 'Persist stable Canvas card ordering locally before network sync.',
    affects: ['canvasCard.position'],
    apply({ tx }, input: { canvasId: string; orderedCardIds: string[] }) {
      input.orderedCardIds.forEach((id, position) => {
        const card = tx.get('canvasCard', id);
        if (card?.canvasId === input.canvasId) {
          tx.patch('canvasCard', id, { position });
        }
      });
    },
  },
});
