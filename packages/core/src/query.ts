import type { ReadonlyEntityStore } from './store.js';
import type { EntityName, EntityRecord } from './types.js';

export type EntityQueryWhere =
  | Record<string, unknown>
  | ((record: EntityRecord) => boolean);

export type EntityQuerySort = (left: EntityRecord, right: EntityRecord) => number;

export type EntityQueryOptions = {
  where?: EntityQueryWhere;
  sort?: EntityQuerySort;
};

export type EntityQueryListener = (records: EntityRecord[]) => void;

function matchesWhere(record: EntityRecord, where?: EntityQueryWhere): boolean {
  if (!where) return true;
  if (typeof where === 'function') return where(record);
  return Object.entries(where).every(([field, expected]) => record[field] === expected);
}

function sameRecords(left: EntityRecord[], right: EntityRecord[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((record, index) => JSON.stringify(record) === JSON.stringify(right[index]));
}

export class EntityQuery {
  private lastRecords: EntityRecord[] | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private readonly listeners = new Set<EntityQueryListener>();

  constructor(
    private readonly store: ReadonlyEntityStore,
    private readonly entity: EntityName,
    private readonly options: EntityQueryOptions = {},
  ) {}

  list(): EntityRecord[] {
    const records = this.store
      .list(this.entity)
      .filter((record) => matchesWhere(record, this.options.where));
    if (this.options.sort) records.sort(this.options.sort);
    return records;
  }

  subscribe(listener: EntityQueryListener, options: { immediate?: boolean } = {}): () => void {
    const { immediate = true } = options;
    this.listeners.add(listener);
    if (immediate) {
      const records = this.publishIfChanged({ force: true });
      if (records) listener(records);
    }
    if (!this.unsubscribeStore) {
      this.unsubscribeStore = this.store.subscribe(() => {
        const records = this.publishIfChanged();
        if (!records) return;
        for (const currentListener of this.listeners) currentListener(records);
      });
    }

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.unsubscribeStore?.();
        this.unsubscribeStore = null;
        this.lastRecords = null;
      }
    };
  }

  private publishIfChanged({ force = false } = {}): EntityRecord[] | null {
    const records = this.list();
    if (!force && this.lastRecords && sameRecords(this.lastRecords, records)) {
      return null;
    }
    this.lastRecords = records;
    return records;
  }
}
