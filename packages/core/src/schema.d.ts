import type { EntityName, FieldName } from './types.js';
export type ConflictPolicyName = 'remoteWins' | 'localWins' | 'localDirtyWins' | 'fieldLevelMerge' | string;
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
export declare function defineSchema(schema: SyncSchema): SyncSchema;
export declare function getFieldConflictPolicy(schema: SyncSchema, entity: EntityName, field: FieldName): ConflictPolicyName;
//# sourceMappingURL=schema.d.ts.map