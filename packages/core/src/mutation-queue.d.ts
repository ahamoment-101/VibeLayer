import type { EntitySyncState, MutationEffect, MutationRecord, MutationStatus } from './types.js';
export declare class MutationQueue {
    private readonly now;
    private records;
    constructor(initialRecords?: MutationRecord[], now?: () => number);
    all(): MutationRecord[];
    pending(): MutationRecord[];
    add(record: MutationRecord): void;
    replace(records: MutationRecord[]): void;
    begin(ids: string[]): void;
    mark(ids: string[], status: MutationStatus, error?: string): void;
    retry(ids?: string[]): void;
    remove(ids: string[]): void;
    mutationIdsFor(entity: string, id: string): string[];
    dirtyFields(entity: string, id: string): Set<string>;
    effectsFor(entity: string, id: string): MutationEffect[];
    entityState(entity: string, id: string): EntitySyncState;
    count(status: MutationStatus): number;
    private update;
}
//# sourceMappingURL=mutation-queue.d.ts.map