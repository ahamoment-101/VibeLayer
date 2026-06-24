import { ConflictResolver, type ConflictPolicyRegistry } from './conflict.js';
import { MutationQueue } from './mutation-queue.js';
import { EntityQuery, type EntityQueryOptions } from './query.js';
import { defineSchema, type SyncSchema } from './schema.js';
import { persistSyncState } from './storage.js';
import { EntityStore, type ReadonlyEntityStore } from './store.js';
import { SyncEngine } from './sync-engine.js';
import type {
  EntitySyncInfo,
  EntitySyncState,
  MutationDefinition,
  MutationInput,
  MutationEffect,
  MutationRecord,
  MutationRegistry,
  StorageAdapter,
  StorageMeta,
  SyncTransport,
} from './types.js';

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
  rewriteMutation?: (
    mutation: MutationRecord,
    context: { entity: string; fromId: string; toId: string },
  ) => MutationRecord;
};

export function defineMutations<const TMutations extends MutationRegistry>(
  mutations: TMutations,
): TMutations {
  return mutations;
}

export class SyncClient<TMutations extends MutationRegistry = MutationRegistry> {
  readonly store: ReadonlyEntityStore;
  readonly sync: SyncEngine;

  private readonly queue: MutationQueue;
  private readonly now: () => number;
  private readonly id: () => string;
  private readonly runtimeStore: EntityStore;

  private constructor(
    private readonly options: Required<
      Pick<SyncClientOptions<TMutations>, 'clientId' | 'schema' | 'mutations' | 'storage' | 'transport' | 'now' | 'id'>
    > & Pick<SyncClientOptions<TMutations>, 'conflictPolicies'>,
    store: EntityStore,
    queue: MutationQueue,
    initialMeta: Awaited<ReturnType<NonNullable<StorageAdapter['loadMeta']>>>,
  ) {
    this.store = store;
    this.runtimeStore = store;
    this.queue = queue;
    this.now = options.now;
    this.id = options.id;
    this.sync = new SyncEngine({
      clientId: options.clientId,
      store,
      queue,
      storage: options.storage,
      transport: options.transport,
      resolver: new ConflictResolver(options.schema, options.conflictPolicies),
      initialMeta,
      now: options.now,
    });
  }

  static async create<TRegistry extends MutationRegistry>(
    options: SyncClientOptions<TRegistry>,
  ): Promise<SyncClient<TRegistry>> {
    const schema = defineSchema(options.schema);
    const now = options.now || (() => Date.now());
    const [entities, mutations, meta] = await Promise.all([
      options.storage.loadEntities(),
      options.storage.loadMutations(),
      options.storage.loadMeta?.() || Promise.resolve({} as StorageMeta),
    ]);
    const clientId = options.clientId
      || (typeof meta.clientId === 'string' ? meta.clientId : undefined)
      || `client_${Math.random().toString(36).slice(2)}`;
    const store = new EntityStore(entities);
    const queue = new MutationQueue(mutations, now);
    const client = new SyncClient<TRegistry>({
      clientId,
      schema,
      mutations: options.mutations,
      storage: options.storage,
      transport: options.transport,
      conflictPolicies: options.conflictPolicies,
      now,
      id: options.id || (() => crypto.randomUUID()),
    }, store, queue, { ...meta, clientId });
    await options.storage.saveMeta?.({ ...meta, clientId });
    return client;
  }

  async mutate<TName extends keyof TMutations & string>(
    name: TName,
    input: MutationInput<TMutations[TName]>,
  ): Promise<MutationRecord<MutationInput<TMutations[TName]>>> {
    type TInput = MutationInput<TMutations[TName]>;
    const definition = this.options.mutations[name] as MutationDefinition<TInput> | undefined;
    if (!definition) {
      const available = Object.keys(this.options.mutations).sort().join(', ') || '(none)';
      throw new Error(`Unknown mutation "${name}". Available mutations: ${available}.`);
    }
    if (!definition.description || !definition.affects?.length) {
      throw new Error(
        `Mutation "${name}" must declare description and affects metadata for developer and Agent tooling.`,
      );
    }

    const createdAt = this.now();
    const effects: MutationEffect[] = [];
    const previousEntities = this.runtimeStore.getSnapshot();
    this.runtimeStore.transaction((tx) => {
      const instrumentedTx = {
        ...tx,
        upsert: (entity: string, record: any) => {
          tx.upsert(entity, record);
          effects.push({
            entity,
            id: record.id,
            operation: 'upsert' as const,
            fields: Object.keys(record).filter((field) => field !== 'id'),
          });
        },
        patch: (entity: string, id: string, patch: Record<string, unknown>) => {
          tx.patch(entity, id, patch);
          effects.push({
            entity,
            id,
            operation: 'patch' as const,
            fields: Object.keys(patch),
          });
        },
        delete: (entity: string, id: string) => {
          tx.delete(entity, id);
          effects.push({ entity, id, operation: 'delete' as const, fields: ['__deleted'] });
        },
      };
      definition.apply({ tx: instrumentedTx, now: this.now, id: this.id }, input);
    });

    if (!effects.length) {
      throw new Error(`Mutation "${name}" did not write any entities. Refusing to enqueue a no-op mutation.`);
    }

    const record: MutationRecord<TInput> = {
      id: this.id(),
      name,
      input,
      status: 'queued',
      createdAt,
      updatedAt: createdAt,
      attempts: 0,
      affects: definition.affects,
      effects,
    };
    this.queue.add(record);
    try {
      await persistSyncState(this.options.storage, {
        entities: this.store.getSnapshot(),
        mutations: this.queue.all(),
      });
    } catch (error) {
      this.runtimeStore.replaceSnapshot(previousEntities);
      this.queue.remove([record.id]);
      throw new Error(
        `Local persistence failed; mutation "${name}" was rolled back. `
        + (error instanceof Error ? error.message : String(error)),
        { cause: error },
      );
    }
    this.sync.emitMutationEnqueued(record);
    return structuredClone(record) as MutationRecord<TInput>;
  }

  getEntitySyncState(entity: string, id: string): EntitySyncState {
    return this.queue.entityState(entity, id);
  }

  getEntitySyncInfo(entity: string, id: string): EntitySyncInfo {
    return {
      state: this.queue.entityState(entity, id),
      dirtyFields: [...this.queue.dirtyFields(entity, id)],
      effects: this.queue.effectsFor(entity, id),
      mutationIds: this.queue.mutationIdsFor(entity, id),
    };
  }

  query(entity: string, options: EntityQueryOptions = {}): EntityQuery {
    return new EntityQuery(this.store, entity, options);
  }

  async remapEntityId(
    entity: string,
    fromId: string,
    toId: string,
    options: RemapEntityIdOptions = {},
  ): Promise<void> {
    if (!fromId || !toId) throw new Error('Both fromId and toId are required.');
    if (fromId === toId) return;

    const previousEntities = this.runtimeStore.getSnapshot();
    const previousMutations = this.queue.all();
    const source = previousEntities[entity]?.[fromId];
    if (!source) return;
    if (previousEntities[entity]?.[toId]) {
      throw new Error(`Cannot remap "${entity}:${fromId}" to existing entity "${entity}:${toId}".`);
    }

    const nextEntities = structuredClone(previousEntities);
    const entityRecords = { ...(nextEntities[entity] || {}) };
    delete entityRecords[fromId];
    entityRecords[toId] = { ...source, id: toId };
    nextEntities[entity] = entityRecords;

    const context = { entity, fromId, toId };
    const nextMutations = previousMutations.map((mutation) => {
      const next = {
        ...mutation,
        effects: mutation.effects.map((effect) => (
          effect.entity === entity && effect.id === fromId
            ? { ...effect, id: toId }
            : effect
        )),
      };
      return options.rewriteMutation
        ? options.rewriteMutation(structuredClone(next), context)
        : next;
    });

    this.runtimeStore.replaceSnapshot(nextEntities);
    this.queue.replace(nextMutations);
    try {
      await persistSyncState(this.options.storage, {
        entities: nextEntities,
        mutations: nextMutations,
      });
      this.sync.refreshLocalState();
    } catch (error) {
      this.runtimeStore.replaceSnapshot(previousEntities);
      this.queue.replace(previousMutations);
      throw new Error(
        `Entity id remap failed and was rolled back for "${entity}:${fromId}" -> "${toId}". `
        + (error instanceof Error ? error.message : String(error)),
        { cause: error },
      );
    }
  }

  async discardEntityState(entity: string, id: string): Promise<void> {
    if (!entity || !id) throw new Error('Both entity and id are required.');

    const previousEntities = this.runtimeStore.getSnapshot();
    const previousMutations = this.queue.all();
    const nextEntities = structuredClone(previousEntities);
    if (nextEntities[entity]?.[id]) {
      const entityRecords = { ...nextEntities[entity] };
      delete entityRecords[id];
      nextEntities[entity] = entityRecords;
    }
    const nextMutations = previousMutations.filter((mutation) => (
      !mutation.effects.some((effect) => effect.entity === entity && effect.id === id)
    ));

    this.runtimeStore.replaceSnapshot(nextEntities);
    this.queue.replace(nextMutations);
    try {
      await persistSyncState(this.options.storage, {
        entities: nextEntities,
        mutations: nextMutations,
      });
      this.sync.refreshLocalState();
    } catch (error) {
      this.runtimeStore.replaceSnapshot(previousEntities);
      this.queue.replace(previousMutations);
      throw new Error(
        `Discarding local state failed and was rolled back for "${entity}:${id}". `
        + (error instanceof Error ? error.message : String(error)),
        { cause: error },
      );
    }
  }

  inspect(): {
    entities: ReturnType<EntityStore['getSnapshot']>;
    queue: MutationRecord[];
    sync: ReturnType<SyncEngine['status']>;
  } {
    return {
      entities: this.store.getSnapshot(),
      queue: this.queue.all(),
      sync: this.sync.status(),
    };
  }

  diagnostics(options: { eventLimit?: number } = {}) {
    return {
      generatedAt: this.now(),
      clientId: this.options.clientId,
      status: this.sync.status(),
      queue: this.queue.all().map((mutation) => ({
        id: mutation.id,
        name: mutation.name,
        status: mutation.status,
        attempts: mutation.attempts,
        error: mutation.error || null,
        affects: mutation.affects,
        effects: mutation.effects,
        createdAt: mutation.createdAt,
        updatedAt: mutation.updatedAt,
      })),
      events: this.sync.inspectEvents(options.eventLimit).map((event) => {
        if (event.type === 'mutation-enqueued') {
          return {
            at: event.at,
            type: event.type,
            mutation: {
              id: event.mutation.id,
              name: event.mutation.name,
              status: event.mutation.status,
              affects: event.mutation.affects,
              effects: event.mutation.effects,
            },
          };
        }
        if (event.type === 'delta-applied' || event.type === 'conflict') {
          return {
            ...event,
            delta: {
              entity: event.delta.entity,
              id: event.delta.id,
              op: event.delta.op,
              version: event.delta.version,
            },
          };
        }
        return event;
      }),
    };
  }
}
