import type { EntitySnapshot, MutationRecord, StorageAdapter, StorageMeta } from './types.js';
export type IndexedDbStorageOptions = {
    databaseName: string;
    version?: number;
    indexedDB?: IDBFactory;
};
export declare class IndexedDbStorageAdapter implements StorageAdapter {
    private readonly options;
    private databasePromise;
    private readonly indexedDB;
    private readonly version;
    constructor(options: IndexedDbStorageOptions);
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
    clear(): Promise<void>;
    close(): void;
    private open;
    private read;
    private write;
}
//# sourceMappingURL=storage-indexeddb.d.ts.map