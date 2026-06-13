import { defineMutations } from '../../packages/core/src/index';

type CreateTodoInput = {
  id: string;
  title: string;
};

type UpdateTitleInput = {
  id: string;
  title: string;
};

type UpdateMemoInput = {
  id: string;
  memo: string;
};

type AddSubTaskInput = {
  id: string;
  todoId: string;
  title: string;
};

export const mutations = defineMutations({
  'todo.create': {
    description: 'Create a todo locally and enqueue it for sync.',
    affects: ['todo'],
    apply({ tx }, input: CreateTodoInput) {
      tx.upsert('todo', {
        id: input.id,
        title: input.title,
        memo: '',
        status: 'pending',
      });
    },
  },

  'todo.updateTitle': {
    description: 'Update the user-visible title of a todo.',
    affects: ['todo.title'],
    apply({ tx }, input: UpdateTitleInput) {
      tx.patch('todo', input.id, { title: input.title });
    },
  },

  'todo.updateMemo': {
    description: 'Update durable todo memo text.',
    affects: ['todo.memo'],
    apply({ tx }, input: UpdateMemoInput) {
      tx.patch('todo', input.id, { memo: input.memo });
    },
  },

  'todo.addSubTask': {
    description: 'Add a child checklist item to a todo using a caller-provided client-generated id.',
    affects: ['subTask'],
    apply({ tx }, input: AddSubTaskInput) {
      tx.upsert('subTask', {
        id: input.id,
        todoId: input.todoId,
        title: input.title,
        done: false,
      });
    },
  },
});
