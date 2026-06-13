export class MutationQueue {
    now;
    records = [];
    constructor(initialRecords = [], now = () => Date.now()) {
        this.now = now;
        this.records = initialRecords.map((record) => ({
            ...record,
            status: record.status === 'syncing' ? 'queued' : record.status,
            effects: record.effects || [],
        }));
    }
    all() {
        return structuredClone(this.records);
    }
    pending() {
        return this.records
            .filter((record) => record.status === 'queued' || record.status === 'failed')
            .map((record) => structuredClone(record));
    }
    add(record) {
        if (this.records.some((candidate) => candidate.id === record.id)) {
            throw new Error(`Mutation id "${record.id}" already exists. Mutation ids must be idempotent.`);
        }
        this.records = [...this.records, structuredClone(record)];
    }
    replace(records) {
        this.records = structuredClone(records);
    }
    begin(ids) {
        const idSet = new Set(ids);
        this.update(idSet, (record) => ({
            ...record,
            attempts: record.attempts + 1,
            status: 'syncing',
            error: undefined,
        }));
    }
    mark(ids, status, error) {
        const idSet = new Set(ids);
        this.update(idSet, (record) => ({ ...record, status, error }));
    }
    retry(ids) {
        const idSet = ids ? new Set(ids) : null;
        this.records = this.records.map((record) => {
            const selected = !idSet || idSet.has(record.id);
            if (!selected || (record.status !== 'failed' && record.status !== 'conflicted'))
                return record;
            return { ...record, status: 'queued', error: undefined, updatedAt: this.now() };
        });
    }
    remove(ids) {
        const idSet = new Set(ids);
        this.records = this.records.filter((record) => !idSet.has(record.id));
    }
    mutationIdsFor(entity, id) {
        return this.records
            .filter((record) => record.effects.some((effect) => effect.entity === entity && effect.id === id))
            .map((record) => record.id);
    }
    dirtyFields(entity, id) {
        const fields = new Set();
        for (const record of this.records) {
            for (const effect of record.effects) {
                if (effect.entity !== entity || effect.id !== id)
                    continue;
                for (const field of effect.fields)
                    fields.add(field);
            }
        }
        return fields;
    }
    effectsFor(entity, id) {
        return this.records.flatMap((record) => (record.effects.filter((effect) => effect.entity === entity && effect.id === id)));
    }
    entityState(entity, id) {
        const statuses = this.records
            .filter((record) => record.effects.some((effect) => effect.entity === entity && effect.id === id))
            .map((record) => record.status);
        if (statuses.includes('conflicted'))
            return 'conflicted';
        if (statuses.includes('failed'))
            return 'failed';
        if (statuses.includes('syncing'))
            return 'syncing';
        if (statuses.includes('queued'))
            return 'queued';
        return 'clean';
    }
    count(status) {
        return this.records.filter((record) => record.status === status).length;
    }
    update(ids, updater) {
        const updatedAt = this.now();
        this.records = this.records.map((record) => (ids.has(record.id) ? { ...updater(record), updatedAt } : record));
    }
}
//# sourceMappingURL=mutation-queue.js.map