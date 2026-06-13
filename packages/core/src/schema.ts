import type { EntityName, FieldName } from './types.js';

export type ConflictPolicyName =
  | 'remoteWins'
  | 'localWins'
  | 'localDirtyWins'
  | 'fieldLevelMerge'
  | string;

export type FieldDefinition = {
  type?: string;
  userEditable?: boolean;
  durableDraft?: boolean;
  conflict?: ConflictPolicyName;
  description?: string;
};

export type EntityDefinition = {
  description?: string;
  primaryKey?: FieldName;
  fields?: Record<FieldName, FieldDefinition>;
  conflict?: ConflictPolicyName;
};

export type SyncSchema = {
  entities: Record<EntityName, EntityDefinition>;
  defaultConflict?: ConflictPolicyName;
};

export function defineSchema(schema: SyncSchema): SyncSchema {
  return {
    defaultConflict: 'remoteWins',
    ...schema,
  };
}

export function getFieldConflictPolicy(
  schema: SyncSchema,
  entity: EntityName,
  field: FieldName,
): ConflictPolicyName {
  const entityDefinition = schema.entities[entity];
  return (
    entityDefinition?.fields?.[field]?.conflict
    || entityDefinition?.conflict
    || schema.defaultConflict
    || 'remoteWins'
  );
}
