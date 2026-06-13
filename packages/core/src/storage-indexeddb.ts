import type {
  EntitySnapshot,
  MutationRecord,
  StorageAdapter,
  StorageMeta,
} from './types.js';

const SNAPSHOT_KEY = 'current';

export type IndexedDbStorageOptions = {
  databaseName: string;
  version?: number;
  indexedDB?: IDBFactory;
};

export class IndexedDbStorageAdapter implements StorageAdapter {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private readonly indexedDB: IDBFactory;
  private readonly version: number;

  constructor(private readonly options: IndexedDbStorageOptions) {
    const factory = options.indexedDB || globalThis.indexedDB;
    if (!factory) {
      throw new Error(
        'IndexedDB is unavailable. Use MemoryStorageAdapter in Node.js tests '
        + 'or pass an IDBFactory through IndexedDbStorageAdapter options.',
      );
    }
    this.indexedDB = factory;
    this.version = options.version || 1;
  }

  loadEntities(): Promise<EntitySnapshot> {
    return this.read<EntitySnapshot>('entities', {});
  }

  saveEntities(snapshot: EntitySnapshot): Promise<void> {
    return this.write('entities', snapshot);
  }

  loadMutations(): Promise<MutationRecord[]> {
    return this.read<MutationRecord[]>('mutations', []);
  }

  saveMutations(mutations: MutationRecord[]): Promise<void> {
    return this.write('mutations', mutations);
  }

  loadMeta(): Promise<StorageMeta> {
    return this.read<StorageMeta>('meta', {});
  }

  saveMeta(meta: StorageMeta): Promise<void> {
    return this.write('meta', meta);
  }

  async saveState(state: {
    entities: EntitySnapshot;
    mutations: MutationRecord[];
    meta?: StorageMeta;
  }): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const storeNames = state.meta
        ? ['entities', 'mutations', 'meta']
        : ['entities', 'mutations'];
      const transaction = database.transaction(storeNames, 'readwrite');
      transaction.objectStore('entities').put(structuredClone(state.entities), SNAPSHOT_KEY);
      transaction.objectStore('mutations').put(structuredClone(state.mutations), SNAPSHOT_KEY);
      if (state.meta) {
        transaction.objectStore('meta').put(structuredClone(state.meta), SNAPSHOT_KEY);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(
        transaction.error || new Error('IndexedDB atomic state write failed.'),
      );
      transaction.onabort = () => reject(
        transaction.error || new Error('IndexedDB atomic state write aborted.'),
      );
    });
  }

  async clear(): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['entities', 'mutations', 'meta'], 'readwrite');
      for (const storeName of ['entities', 'mutations', 'meta']) {
        transaction.objectStore(storeName).clear();
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB clear failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB clear aborted.'));
    });
  }

  close(): void {
    if (!this.databasePromise) return;
    void this.databasePromise.then((database) => database.close());
    this.databasePromise = null;
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(this.options.databaseName, this.version);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const storeName of ['entities', 'mutations', 'meta']) {
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName);
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
      request.onblocked = () => reject(new Error(
        `IndexedDB "${this.options.databaseName}" upgrade is blocked by another open tab.`,
      ));
    });
    return this.databasePromise;
  }

  private async read<T>(storeName: string, fallback: T): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(SNAPSHOT_KEY);
      request.onsuccess = () => resolve(
        request.result === undefined ? structuredClone(fallback) : request.result as T,
      );
      request.onerror = () => reject(request.error || new Error(`IndexedDB read failed: ${storeName}.`));
    });
  }

  private async write<T>(storeName: string, value: T): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(structuredClone(value), SNAPSHOT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error(`IndexedDB write failed: ${storeName}.`));
      transaction.onabort = () => reject(transaction.error || new Error(`IndexedDB write aborted: ${storeName}.`));
    });
  }
}
