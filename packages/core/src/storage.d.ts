import type { EntitySnapshot, MutationRecord, StorageAdapter, StorageMeta } from './types.js';
export declare function persistSyncState(storage: StorageAdapter, state: {
    entities: EntitySnapshot;
    mutations: MutationRecord[];
    meta?: StorageMeta;
}): Promise<void>;
//# sourceMappingURL=storage.d.ts.map