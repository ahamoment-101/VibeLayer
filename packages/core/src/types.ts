export type EntityName = string;
export type EntityId = string;
export type FieldName = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type EntityRecord = {
  id: EntityId;
  [field: string]: unknown;
};

export type EntitySnapshot = Record<EntityName, Record<EntityId, EntityRecord>>;

export type MutationStatus = 'queued' | 'syncing' | 'failed' | 'conflicted';
export type EntitySyncState = 'clean' | 'queued' | 'syncing' | 'failed' | 'conflicted';
export type SyncPhase = 'idle' | 'pushing' | 'pulling' | 'error';

export type MutationEffect = {
  entity: EntityName;
  id: EntityId;
  operation: 'upsert' | 'patch' | 'delete';
  fields: string[];
};

export type MutationRecord<TInput = unknown> = {
  id: string;
  name: string;
  input: TInput;
  status: MutationStatus;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  error?: string;
  affects?: string[];
  effects: MutationEffect[];
};

export type EntitySyncInfo = {
  state: EntitySyncState;
  dirtyFields: string[];
  effects: MutationEffect[];
  mutationIds: string[];
};

export type DeltaOperation = 'upsert' | 'patch' | 'delete';

export type RemoteDelta = {
  entity: EntityName;
  id: EntityId;
  op: DeltaOperation;
  data?: EntityRecord;
  patch?: Record<string, unknown>;
  version?: string | number;
};

export type PushRequest = {
  clientId: string;
  mutations: MutationRecord[];
};

export type PushResult = {
  ackedMutationIds: string[];
  rejected?: Array<{ mutationId: string; error: string; conflict?: boolean }>;
  deltas?: RemoteDelta[];
};

export type PullRequest = {
  clientId: string;
  cursor?: string | number | null;
};

export type PullResult = {
  cursor?: string | number | null;
  deltas: RemoteDelta[];
};

export type ReconcileResult = {
  entities: EntitySnapshot;
  deleted: Array<{ entity: EntityName; id: EntityId }>;
};

export type SyncTransport = {
  push(request: PushRequest): Promise<PushResult>;
  pull?(request: PullRequest): Promise<PullResult>;
};

export type StorageMeta = {
  cursor?: string | number | null;
  clientId?: string;
  [key: string]: unknown;
};

export type PersistedSyncState = {
  entities: EntitySnapshot;
  mutations: MutationRecord[];
  meta?: StorageMeta;
};

export type StorageAdapter = {
  loadEntities(): Promise<EntitySnapshot>;
  saveEntities(snapshot: EntitySnapshot): Promise<void>;
  loadMutations(): Promise<MutationRecord[]>;
  saveMutations(mutations: MutationRecord[]): Promise<void>;
  loadMeta?(): Promise<StorageMeta>;
  saveMeta?(meta: StorageMeta): Promise<void>;
  saveState?(state: PersistedSyncState): Promise<void>;
};

export type MutationApplyContext = {
  tx: EntityTransaction;
  now: () => number;
  id: () => string;
};

export type MutationDefinition<TInput = unknown> = {
  description: string;
  affects: string[];
  apply(context: MutationApplyContext, input: TInput): void;
};

export type MutationRegistry = Record<string, MutationDefinition<any>>;
export type MutationInput<TDefinition> = TDefinition extends MutationDefinition<infer TInput>
  ? TInput
  : never;

export type EntityTransaction = {
  get(entity: EntityName, id: EntityId): EntityRecord | undefined;
  upsert(entity: EntityName, record: EntityRecord): void;
  patch(entity: EntityName, id: EntityId, patch: Record<string, unknown>): void;
  delete(entity: EntityName, id: EntityId): void;
};

export type SyncStatus = {
  phase: SyncPhase;
  online: boolean;
  pendingCount: number;
  failedCount: number;
  conflictedCount: number;
  cursor: string | number | null;
  lastSyncedAt: number | null;
  lastError: string | null;
};

export type SyncEvent =
  | { type: 'status'; status: SyncStatus }
  | { type: 'mutation-enqueued'; mutation: MutationRecord }
  | { type: 'mutation-acked'; mutationIds: string[] }
  | { type: 'mutation-failed'; mutationIds: string[]; error: string }
  | { type: 'delta-applied'; delta: RemoteDelta; resolution: string }
  | { type: 'conflict'; delta: RemoteDelta; mutationIds: string[]; reason?: string };

export type SyncEventRecord = SyncEvent & { at: number };
