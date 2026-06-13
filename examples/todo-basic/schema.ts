import { defineSchema } from '../../packages/core/src/index';

export const schema = defineSchema({
  defaultConflict: 'fieldLevelMerge',
  entities: {
    todo: {
      description: 'A user-editable task with a durable memo field.',
      primaryKey: 'id',
      conflict: 'fieldLevelMerge',
      fields: {
        id: { type: 'string' },
        title: {
          type: 'string',
          userEditable: true,
          durableDraft: true,
          conflict: 'localDirtyWins',
          description: 'User-visible task title.',
        },
        memo: {
          type: 'text',
          userEditable: true,
          durableDraft: true,
          conflict: 'localDirtyWins',
          description: 'Freeform notes. Local dirty edits must not be overwritten.',
        },
        status: {
          type: 'enum',
          userEditable: true,
          conflict: 'remoteWins',
        },
      },
    },
    subTask: {
      description: 'A child checklist item belonging to a todo.',
      primaryKey: 'id',
      conflict: 'fieldLevelMerge',
      fields: {
        id: { type: 'string' },
        todoId: { type: 'string' },
        title: { type: 'string', userEditable: true, conflict: 'localDirtyWins' },
        done: { type: 'boolean', userEditable: true, conflict: 'remoteWins' },
      },
    },
  },
});
