import type { EntitySnapshot, MutationRecord, StorageAdapter, StorageMeta } from './types.js';
export declare class MemoryStorageAdapter implements StorageAdapter {
    private entities;
    private mutations;
    private meta;
    loadEntities(): Promise<EntitySnapshot>;
    saveEntities(snapshot: EntitySnapshot): Promise<void>;
    loadMutations(): Promise<MutationRecord[]>;
    saveMutations(mutations: MutationRecord[]): Promise<void>;
    loadMeta(): Promise<StorageMeta>;
    saveMeta(meta: StorageMeta): Promise<void>;
    saveState(state: {
        entities: EntitySnapshot;
        mutations: MutationRecord[];
        meta?: StorageMeta;
    }): Promise<void>;
}
//# sourceMappingURL=storage-memory.d.ts.map