const SNAPSHOT_KEY = 'current';
export class IndexedDbStorageAdapter {
    options;
    databasePromise = null;
    indexedDB;
    version;
    constructor(options) {
        this.options = options;
        const factory = options.indexedDB || globalThis.indexedDB;
        if (!factory) {
            throw new Error('IndexedDB is unavailable. Use MemoryStorageAdapter in Node.js tests '
                + 'or pass an IDBFactory through IndexedDbStorageAdapter options.');
        }
        this.indexedDB = factory;
        this.version = options.version || 1;
    }
    loadEntities() {
        return this.read('entities', {});
    }
    saveEntities(snapshot) {
        return this.write('entities', snapshot);
    }
    loadMutations() {
        return this.read('mutations', []);
    }
    saveMutations(mutations) {
        return this.write('mutations', mutations);
    }
    loadMeta() {
        return this.read('meta', {});
    }
    saveMeta(meta) {
        return this.write('meta', meta);
    }
    async saveState(state) {
        const database = await this.open();
        await new Promise((resolve, reject) => {
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
            transaction.onerror = () => reject(transaction.error || new Error('IndexedDB atomic state write failed.'));
            transaction.onabort = () => reject(transaction.error || new Error('IndexedDB atomic state write aborted.'));
        });
    }
    async clear() {
        const database = await this.open();
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(['entities', 'mutations', 'meta'], 'readwrite');
            for (const storeName of ['entities', 'mutations', 'meta']) {
                transaction.objectStore(storeName).clear();
            }
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('IndexedDB clear failed.'));
            transaction.onabort = () => reject(transaction.error || new Error('IndexedDB clear aborted.'));
        });
    }
    close() {
        if (!this.databasePromise)
            return;
        void this.databasePromise.then((database) => database.close());
        this.databasePromise = null;
    }
    open() {
        if (this.databasePromise)
            return this.databasePromise;
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
            request.onblocked = () => reject(new Error(`IndexedDB "${this.options.databaseName}" upgrade is blocked by another open tab.`));
        });
        return this.databasePromise;
    }
    async read(storeName, fallback) {
        const database = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readonly');
            const request = transaction.objectStore(storeName).get(SNAPSHOT_KEY);
            request.onsuccess = () => resolve(request.result === undefined ? structuredClone(fallback) : request.result);
            request.onerror = () => reject(request.error || new Error(`IndexedDB read failed: ${storeName}.`));
        });
    }
    async write(storeName, value) {
        const database = await this.open();
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readwrite');
            transaction.objectStore(storeName).put(structuredClone(value), SNAPSHOT_KEY);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error(`IndexedDB write failed: ${storeName}.`));
            transaction.onabort = () => reject(transaction.error || new Error(`IndexedDB write aborted: ${storeName}.`));
        });
    }
}
//# sourceMappingURL=storage-indexeddb.js.map