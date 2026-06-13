import { type SyncSchema } from './schema.js';
import type { EntityRecord, MutationRecord, RemoteDelta } from './types.js';
export type ConflictContext = {
    schema: SyncSchema;
    entity: string;
    id: string;
    base?: EntityRecord;
    local?: EntityRecord;
    remote?: EntityRecord;
    delta: RemoteDelta;
    localDirtyFields: Set<string>;
    pendingMutations: MutationRecord[];
};
export type ConflictResolution = {
    action: 'useRemote';
    value?: EntityRecord;
    reason?: string;
} | {
    action: 'useLocal';
    value?: EntityRecord;
    reason?: string;
} | {
    action: 'merge';
    value: EntityRecord;
    reason?: string;
} | {
    action: 'delete';
    reason?: string;
} | {
    action: 'manual';
    value?: EntityRecord;
    reason?: string;
};
export type ConflictPolicy = (context: ConflictContext) => ConflictResolution;
export type ConflictPolicyRegistry = Record<string, ConflictPolicy>;
export declare const conflictPolicies: ConflictPolicyRegistry;
export declare class ConflictResolver {
    private readonly schema;
    private readonly policies;
    constructor(schema: SyncSchema, customPolicies?: ConflictPolicyRegistry);
    resolve(context: Omit<ConflictContext, 'schema'>): ConflictResolution;
}
//# sourceMappingURL=conflict.d.ts.map