import type { EntityName, EntityRecord, EntitySnapshot, EntityTransaction } from './types.js';

type StoreListener = () => void;

export type ReadonlyEntityStore = Pick<
  EntityStore,
  'getSnapshot' | 'get' | 'list' | 'subscribe'
>;

function cloneSnapshot(snapshot: EntitySnapshot): EntitySnapshot {
  return structuredClone(snapshot);
}

export class EntityStore {
  private snapshot: EntitySnapshot;
  private listeners = new Set<StoreListener>();

  constructor(initialSnapshot: EntitySnapshot = {}) {
    this.snapshot = cloneSnapshot(initialSnapshot);
  }

  getSnapshot(): EntitySnapshot {
    return cloneSnapshot(this.snapshot);
  }

  replaceSnapshot(snapshot: EntitySnapshot): void {
    this.snapshot = cloneSnapshot(snapshot);
    this.emit();
  }

  get(entity: EntityName, id: string): EntityRecord | undefined {
    const record = this.snapshot[entity]?.[id];
    return record ? structuredClone(record) : undefined;
  }

  list(entity: EntityName): EntityRecord[] {
    return structuredClone(Object.values(this.snapshot[entity] || {}));
  }

  upsert(entity: EntityName, record: EntityRecord): void {
    this.snapshot = cloneSnapshot(this.snapshot);
    this.snapshot[entity] = {
      ...(this.snapshot[entity] || {}),
      [record.id]: structuredClone(record),
    };
    this.emit();
  }

  patch(entity: EntityName, id: string, patch: Record<string, unknown>): void {
    const current = this.get(entity, id);
    if (!current) {
      throw new Error(`Cannot patch missing entity "${entity}:${id}".`);
    }
    this.upsert(entity, { ...current, ...patch, id });
  }

  delete(entity: EntityName, id: string): void {
    if (!this.snapshot[entity]?.[id]) return;
    this.snapshot = cloneSnapshot(this.snapshot);
    const records = { ...this.snapshot[entity] };
    delete records[id];
    this.snapshot[entity] = records;
    this.emit();
  }

  transaction(apply: (tx: EntityTransaction) => void): void {
    const draft = cloneSnapshot(this.snapshot);
    const tx: EntityTransaction = {
      get: (entity, id) => draft[entity]?.[id],
      upsert: (entity, record) => {
        draft[entity] = { ...(draft[entity] || {}), [record.id]: record };
      },
      patch: (entity, id, patch) => {
        const current = draft[entity]?.[id];
        if (!current) throw new Error(`Cannot patch missing entity "${entity}:${id}".`);
        draft[entity] = { ...draft[entity], [id]: { ...current, ...patch, id } };
      },
      delete: (entity, id) => {
        if (!draft[entity]?.[id]) return;
        const records = { ...draft[entity] };
        delete records[id];
        draft[entity] = records;
      },
    };
    apply(tx);
    this.snapshot = draft;
    this.emit();
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
