function cloneSnapshot(snapshot) {
    return structuredClone(snapshot);
}
export class EntityStore {
    snapshot;
    listeners = new Set();
    constructor(initialSnapshot = {}) {
        this.snapshot = cloneSnapshot(initialSnapshot);
    }
    getSnapshot() {
        return cloneSnapshot(this.snapshot);
    }
    replaceSnapshot(snapshot) {
        this.snapshot = cloneSnapshot(snapshot);
        this.emit();
    }
    get(entity, id) {
        const record = this.snapshot[entity]?.[id];
        return record ? structuredClone(record) : undefined;
    }
    list(entity) {
        return structuredClone(Object.values(this.snapshot[entity] || {}));
    }
    upsert(entity, record) {
        this.snapshot = cloneSnapshot(this.snapshot);
        this.snapshot[entity] = {
            ...(this.snapshot[entity] || {}),
            [record.id]: structuredClone(record),
        };
        this.emit();
    }
    patch(entity, id, patch) {
        const current = this.get(entity, id);
        if (!current) {
            throw new Error(`Cannot patch missing entity "${entity}:${id}".`);
        }
        this.upsert(entity, { ...current, ...patch, id });
    }
    delete(entity, id) {
        if (!this.snapshot[entity]?.[id])
            return;
        this.snapshot = cloneSnapshot(this.snapshot);
        const records = { ...this.snapshot[entity] };
        delete records[id];
        this.snapshot[entity] = records;
        this.emit();
    }
    transaction(apply) {
        const draft = cloneSnapshot(this.snapshot);
        const tx = {
            get: (entity, id) => draft[entity]?.[id],
            upsert: (entity, record) => {
                draft[entity] = { ...(draft[entity] || {}), [record.id]: record };
            },
            patch: (entity, id, patch) => {
                const current = draft[entity]?.[id];
                if (!current)
                    throw new Error(`Cannot patch missing entity "${entity}:${id}".`);
                draft[entity] = { ...draft[entity], [id]: { ...current, ...patch, id } };
            },
            delete: (entity, id) => {
                if (!draft[entity]?.[id])
                    return;
                const records = { ...draft[entity] };
                delete records[id];
                draft[entity] = records;
            },
        };
        apply(tx);
        this.snapshot = draft;
        this.emit();
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    emit() {
        for (const listener of this.listeners)
            listener();
    }
}
//# sourceMappingURL=store.js.map