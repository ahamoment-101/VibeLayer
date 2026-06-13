import type { SyncSchema } from './schema.js';
import type { MutationRegistry } from './types.js';

export type AgentContract = {
  protocolVersion: 1;
  principles: string[];
  entities: Array<{
    name: string;
    description?: string;
    primaryKey: string;
    conflict: string;
    fields: Array<{
      name: string;
      type: string;
      description?: string;
      userEditable: boolean;
      durableDraft: boolean;
      conflict: string;
    }>;
  }>;
  mutations: Array<{
    name: string;
    description: string;
    affects: string[];
  }>;
  verification: {
    requiredScenarios: string[];
  };
};

export function createAgentContract(
  schema: SyncSchema,
  mutations: MutationRegistry,
): AgentContract {
  return {
    protocolVersion: 1,
    principles: [
      'Read UI data from the local store.',
      'Write business intent through named mutations.',
      'Do not overwrite pending local edits with remote snapshots.',
      'Use client-generated stable ids for new entities.',
    ],
    entities: Object.entries(schema.entities).map(([name, entity]) => ({
      name,
      description: entity.description,
      primaryKey: entity.primaryKey || 'id',
      conflict: entity.conflict || schema.defaultConflict || 'remoteWins',
      fields: Object.entries(entity.fields || {}).map(([fieldName, field]) => ({
        name: fieldName,
        type: field.type || 'unknown',
        description: field.description,
        userEditable: field.userEditable || false,
        durableDraft: field.durableDraft || false,
        conflict: field.conflict || entity.conflict || schema.defaultConflict || 'remoteWins',
      })),
    })),
    mutations: Object.entries(mutations).map(([name, mutation]) => ({
      name,
      description: mutation.description,
      affects: mutation.affects,
    })),
    verification: {
      requiredScenarios: [
        'local-write-before-network',
        'offline-restart-recovery',
        'ordered-replay',
        'retry-after-push-failure',
        'remote-delta-with-local-dirty-fields',
        'stable-client-generated-ids',
        'initialization-recovery',
        'authoritative-snapshot-scope',
        'idempotent-delete-retry',
        'cross-field-response-isolation',
        'offline-create-idempotency',
      ],
    },
  };
}
