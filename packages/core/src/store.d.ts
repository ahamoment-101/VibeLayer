import type { EntityName, EntityRecord, EntitySnapshot, EntityTransaction } from './types.js';
type StoreListener = () => void;
export type ReadonlyEntityStore = Pick<EntityStore, 'getSnapshot' | 'get' | 'list' | 'subscribe'>;
export declare class EntityStore {
    private snapshot;
    private listeners;
    constructor(initialSnapshot?: EntitySnapshot);
    getSnapshot(): EntitySnapshot;
    replaceSnapshot(snapshot: EntitySnapshot): void;
    get(entity: EntityName, id: string): EntityRecord | undefined;
    list(entity: EntityName): EntityRecord[];
    upsert(entity: EntityName, record: EntityRecord): void;
    patch(entity: EntityName, id: string, patch: Record<string, unknown>): void;
    delete(entity: EntityName, id: string): void;
    transaction(apply: (tx: EntityTransaction) => void): void;
    subscribe(listener: StoreListener): () => void;
    private emit;
}
export {};
//# sourceMappingURL=store.d.ts.map