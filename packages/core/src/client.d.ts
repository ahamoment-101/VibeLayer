import { type ConflictPolicyRegistry } from './conflict.js';
import { type SyncSchema } from './schema.js';
import { EntityStore, type ReadonlyEntityStore } from './store.js';
import { SyncEngine } from './sync-engine.js';
import type { EntitySyncState, MutationInput, MutationEffect, MutationRecord, MutationRegistry, StorageAdapter, SyncTransport } from './types.js';
export type SyncClientOptions<TMutations extends MutationRegistry = MutationRegistry> = {
    clientId?: string;
    schema: SyncSchema;
    mutations: TMutations;
    storage: StorageAdapter;
    transport: SyncTransport;
    conflictPolicies?: ConflictPolicyRegistry;
    now?: () => number;
    id?: () => string;
};
export type RemapEntityIdOptions = {
    rewriteMutation?: (mutation: MutationRecord, context: {
        entity: string;
        fromId: string;
        toId: string;
    }) => MutationRecord;
};
export declare function defineMutations<const TMutations extends MutationRegistry>(mutations: TMutations): TMutations;
export declare class SyncClient<TMutations extends MutationRegistry = MutationRegistry> {
    private readonly options;
    readonly store: ReadonlyEntityStore;
    readonly sync: SyncEngine;
    private readonly queue;
    private readonly now;
    private readonly id;
    private readonly runtimeStore;
    private constructor();
    static create<TRegistry extends MutationRegistry>(options: SyncClientOptions<TRegistry>): Promise<SyncClient<TRegistry>>;
    mutate<TName extends keyof TMutations & string>(name: TName, input: MutationInput<TMutations[TName]>): Promise<MutationRecord<MutationInput<TMutations[TName]>>>;
    getEntitySyncState(entity: string, id: string): EntitySyncState;
    remapEntityId(entity: string, fromId: string, toId: string, options?: RemapEntityIdOptions): Promise<void>;
    discardEntityState(entity: string, id: string): Promise<void>;
    inspect(): {
        entities: ReturnType<EntityStore['getSnapshot']>;
        queue: MutationRecord[];
        sync: ReturnType<SyncEngine['status']>;
    };
    diagnostics(options?: {
        eventLimit?: number;
    }): {
        generatedAt: number;
        clientId: string;
        status: import("./types.js").SyncStatus;
        queue: {
            id: string;
            name: string;
            status: import("./types.js").MutationStatus;
            attempts: number;
            error: string | null;
            affects: string[] | undefined;
            effects: MutationEffect[];
            createdAt: number;
            updatedAt: number;
        }[];
        events: (({
            type: "status";
            status: import("./types.js").SyncStatus;
        } & {
            at: number;
        }) | ({
            type: "mutation-acked";
            mutationIds: string[];
        } & {
            at: number;
        }) | ({
            type: "mutation-failed";
            mutationIds: string[];
            error: string;
        } & {
            at: number;
        }) | {
            at: number;
            type: "mutation-enqueued";
            mutation: {
                id: string;
                name: string;
                status: import("./types.js").MutationStatus;
                affects: string[] | undefined;
                effects: MutationEffect[];
            };
        } | {
            delta: {
                entity: string;
                id: string;
                op: import("./types.js").DeltaOperation;
                version: string | number | undefined;
            };
            type: "delta-applied";
            resolution: string;
            at: number;
            mutation?: undefined;
        } | {
            delta: {
                entity: string;
                id: string;
                op: import("./types.js").DeltaOperation;
                version: string | number | undefined;
            };
            type: "conflict";
            mutationIds: string[];
            reason?: string;
            at: number;
            mutation?: undefined;
        })[];
    };
}
//# sourceMappingURL=client.d.ts.map