import { ConflictResolver } from './conflict.js';
import { MutationQueue } from './mutation-queue.js';
import { EntityStore } from './store.js';
import type { EntityRecord, MutationRecord, PullResult, RemoteDelta, StorageAdapter, StorageMeta, SyncEvent, SyncEventRecord, SyncStatus, SyncTransport } from './types.js';
export type SyncEngineOptions = {
    clientId: string;
    store: EntityStore;
    queue: MutationQueue;
    storage: StorageAdapter;
    transport: SyncTransport;
    resolver: ConflictResolver;
    initialMeta?: StorageMeta;
    now?: () => number;
};
type SyncListener = (event: SyncEvent) => void;
export declare class SyncEngine {
    private readonly options;
    private operationChain;
    private listeners;
    private eventHistory;
    private meta;
    private currentStatus;
    private readonly now;
    constructor(options: SyncEngineOptions);
    push(): Promise<void>;
    pull(): Promise<PullResult | null>;
    syncNow(): Promise<void>;
    reconcile(deltas: RemoteDelta[], options?: {
        cursor?: string | number | null;
    }): Promise<void>;
    reconcileSnapshot(entity: string, records: EntityRecord[], options?: {
        deleteMissing?: boolean;
        includeLocal?: (record: EntityRecord) => boolean;
    }): Promise<void>;
    status(): SyncStatus;
    inspectQueue(): MutationRecord[];
    inspectEvents(limit?: number): SyncEventRecord[];
    refreshLocalState(): void;
    retry(mutationIds?: string[]): Promise<void>;
    subscribe(listener: SyncListener): () => void;
    emitMutationEnqueued(mutation: MutationRecord): void;
    private pushInternal;
    private pullInternal;
    private applyDelta;
    private applyResolution;
    private runExclusive;
    private refreshStatus;
    private emit;
    private persistQueue;
    private persistAll;
}
export {};
//# sourceMappingURL=sync-engine.d.ts.map