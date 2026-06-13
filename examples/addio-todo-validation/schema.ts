import { defineSchema } from '../../packages/core/src/index';

export const addioTodoSchema = defineSchema({
  defaultConflict: 'fieldLevelMerge',
  entities: {
    todo: {
      description: 'An Addio todo projected from the public REST API.',
      primaryKey: 'id',
      conflict: 'fieldLevelMerge',
      fields: {
        id: { type: 'string' },
        taskSummary: {
          type: 'string',
          userEditable: true,
          durableDraft: true,
          conflict: 'localDirtyWins',
          description: 'Todo title edited directly by the user.',
        },
        memoContent: {
          type: 'text',
          userEditable: true,
          durableDraft: true,
          conflict: 'localDirtyWins',
          description: 'Freeform memo text that must survive close, restart, and stale pulls.',
        },
        memoBlocks: {
          type: 'json',
          userEditable: true,
          durableDraft: true,
          conflict: 'localDirtyWins',
        },
        status: { type: 'enum', userEditable: true, conflict: 'localDirtyWins' },
        priority: { type: 'enum', userEditable: true, conflict: 'localDirtyWins' },
        projectId: { type: 'string', userEditable: true, conflict: 'localDirtyWins' },
        subTasks: {
          type: 'json',
          userEditable: true,
          durableDraft: true,
          conflict: 'localDirtyWins',
        },
        updatedAt: { type: 'datetime', conflict: 'remoteWins' },
      },
    },
    think: {
      description: 'An Addio Note whose document survives close, restart, and offline edits.',
      primaryKey: 'id',
      conflict: 'fieldLevelMerge',
      fields: {
        id: { type: 'string' },
        title: { type: 'string', userEditable: true, durableDraft: true, conflict: 'localDirtyWins' },
        projectId: { type: 'string', userEditable: true, conflict: 'localDirtyWins' },
        content: { type: 'json', userEditable: true, durableDraft: true, conflict: 'localDirtyWins' },
        pages: { type: 'json', userEditable: true, durableDraft: true, conflict: 'localDirtyWins' },
        preview: { type: 'text', conflict: 'remoteWins' },
        linkedTodoId: { type: 'string', conflict: 'remoteWins' },
        updatedAt: { type: 'datetime', conflict: 'remoteWins' },
      },
    },
    canvasCard: {
      description: 'A lightweight Canvas-to-item relationship with a stable client-generated id.',
      primaryKey: 'id',
      conflict: 'fieldLevelMerge',
      fields: {
        id: { type: 'string' },
        canvasId: { type: 'string', conflict: 'localDirtyWins' },
        type: { type: 'enum', conflict: 'localDirtyWins' },
        refId: { type: 'string', conflict: 'localDirtyWins' },
        position: {
          type: 'number',
          userEditable: true,
          durableDraft: true,
          conflict: 'localDirtyWins',
        },
        addedBy: { type: 'string', conflict: 'remoteWins' },
        addedAt: { type: 'datetime', conflict: 'remoteWins' },
      },
    },
  },
});
