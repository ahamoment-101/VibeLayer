import { persistSyncState } from './storage.js';
export class SyncEngine {
    options;
    operationChain = Promise.resolve();
    listeners = new Set();
    eventHistory = [];
    meta;
    currentStatus;
    now;
    constructor(options) {
        this.options = options;
        this.now = options.now || (() => Date.now());
        this.meta = { ...(options.initialMeta || {}), clientId: options.clientId };
        this.currentStatus = {
            phase: 'idle',
            online: true,
            pendingCount: 0,
            failedCount: 0,
            conflictedCount: 0,
            cursor: this.meta.cursor ?? null,
            lastSyncedAt: null,
            lastError: null,
        };
        this.refreshStatus();
    }
    push() {
        return this.runExclusive(() => this.pushInternal());
    }
    pull() {
        return this.runExclusive(() => this.pullInternal());
    }
    syncNow() {
        return this.runExclusive(async () => {
            await this.pushInternal();
            await this.pullInternal();
        });
    }
    reconcile(deltas, options = {}) {
        return this.runExclusive(async () => {
            const previousEntities = this.options.store.getSnapshot();
            const previousMutations = this.options.queue.all();
            const previousMeta = { ...this.meta };
            try {
                for (const delta of deltas)
                    this.applyDelta(delta);
                if (options.cursor !== undefined)
                    this.meta.cursor = options.cursor;
                await this.persistAll();
                this.refreshStatus({
                    phase: 'idle',
                    cursor: this.meta.cursor ?? null,
                    lastError: null,
                });
            }
            catch (error) {
                this.options.store.replaceSnapshot(previousEntities);
                this.options.queue.replace(previousMutations);
                this.meta = previousMeta;
                this.refreshStatus({
                    phase: 'error',
                    lastError: error instanceof Error ? error.message : String(error),
                });
                throw error;
            }
        });
    }
    reconcileSnapshot(entity, records, options = {}) {
        const remoteIds = new Set(records.map((record) => String(record.id)));
        const deltas = records.map((record) => ({
            entity,
            id: String(record.id),
            op: 'upsert',
            data: { ...record, id: String(record.id) },
        }));
        if (options.deleteMissing) {
            for (const local of this.options.store.list(entity)) {
                if (options.includeLocal && !options.includeLocal(local))
                    continue;
                if (!remoteIds.has(String(local.id))) {
                    deltas.push({ entity, id: String(local.id), op: 'delete' });
                }
            }
        }
        return this.reconcile(deltas);
    }
    status() {
        return { ...this.currentStatus };
    }
    inspectQueue() {
        return this.options.queue.all();
    }
    inspectEvents(limit = 100) {
        const safeLimit = Math.min(Math.max(Math.floor(limit) || 100, 1), 500);
        return structuredClone(this.eventHistory.slice(-safeLimit));
    }
    refreshLocalState() {
        this.refreshStatus();
    }
    retry(mutationIds) {
        return this.runExclusive(async () => {
            this.options.queue.retry(mutationIds);
            await this.persistQueue();
            this.refreshStatus();
            await this.pushInternal();
        });
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener({ type: 'status', status: this.status() });
        return () => this.listeners.delete(listener);
    }
    emitMutationEnqueued(mutation) {
        this.emit({ type: 'mutation-enqueued', mutation });
        this.refreshStatus();
    }
    async pushInternal() {
        const pending = this.options.queue.pending();
        if (!pending.length) {
            this.refreshStatus({ phase: 'idle', lastError: null });
            return;
        }
        const mutationIds = pending.map((record) => record.id);
        this.options.queue.begin(mutationIds);
        this.refreshStatus({ phase: 'pushing', lastError: null });
        await this.persistQueue();
        try {
            const result = await this.options.transport.push({
                clientId: this.options.clientId,
                mutations: this.options.queue.all().filter((record) => mutationIds.includes(record.id)),
            });
            const ackedIds = result.ackedMutationIds.filter((id) => mutationIds.includes(id));
            const rejectedIds = new Set((result.rejected || []).map((item) => item.mutationId));
            const unaccountedIds = mutationIds.filter((id) => !ackedIds.includes(id) && !rejectedIds.has(id));
            // Reconcile while the acknowledged mutations still mark their fields dirty.
            // A transport may return one delta per queued mutation, so an older create
            // response must not overwrite a later edit acknowledged in the same batch.
            for (const delta of result.deltas || [])
                this.applyDelta(delta);
            if (ackedIds.length) {
                this.options.queue.remove(ackedIds);
                this.emit({ type: 'mutation-acked', mutationIds: ackedIds });
            }
            for (const rejection of result.rejected || []) {
                const status = rejection.conflict ? 'conflicted' : 'failed';
                this.options.queue.mark([rejection.mutationId], status, rejection.error);
                this.emit({
                    type: rejection.conflict ? 'conflict' : 'mutation-failed',
                    ...(rejection.conflict
                        ? {
                            delta: {
                                entity: '__transport__',
                                id: rejection.mutationId,
                                op: 'patch',
                            },
                            mutationIds: [rejection.mutationId],
                            reason: rejection.error,
                        }
                        : { mutationIds: [rejection.mutationId], error: rejection.error }),
                });
            }
            if (unaccountedIds.length) {
                const error = 'Push response did not acknowledge or reject these mutations.';
                this.options.queue.mark(unaccountedIds, 'failed', error);
                this.emit({ type: 'mutation-failed', mutationIds: unaccountedIds, error });
            }
            await this.persistAll();
            this.refreshStatus({
                phase: 'idle',
                online: true,
                lastSyncedAt: this.now(),
                lastError: null,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const stillSyncing = this.options.queue.all()
                .filter((record) => record.status === 'syncing')
                .map((record) => record.id);
            this.options.queue.mark(stillSyncing, 'failed', message);
            await this.persistQueue();
            this.emit({ type: 'mutation-failed', mutationIds: stillSyncing, error: message });
            this.refreshStatus({ phase: 'error', online: false, lastError: message });
            throw new Error(`Sync push failed; local data remains queued. ${message}`, { cause: error });
        }
    }
    async pullInternal() {
        if (!this.options.transport.pull)
            return null;
        this.refreshStatus({ phase: 'pulling', lastError: null });
        try {
            const result = await this.options.transport.pull({
                clientId: this.options.clientId,
                cursor: this.meta.cursor ?? null,
            });
            for (const delta of result.deltas)
                this.applyDelta(delta);
            this.meta.cursor = result.cursor ?? this.meta.cursor ?? null;
            await this.persistAll();
            this.refreshStatus({
                phase: 'idle',
                online: true,
                cursor: this.meta.cursor ?? null,
                lastSyncedAt: this.now(),
                lastError: null,
            });
            return result;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.refreshStatus({ phase: 'error', online: false, lastError: message });
            throw new Error(`Sync pull failed; local data was preserved. ${message}`, { cause: error });
        }
    }
    applyDelta(delta) {
        const local = this.options.store.get(delta.entity, delta.id);
        const remote = delta.op === 'delete'
            ? undefined
            : delta.op === 'patch'
                ? { ...(local || { id: delta.id }), ...(delta.patch || {}), id: delta.id }
                : delta.data;
        const pendingMutations = this.options.queue.all().filter((record) => (record.effects.some((effect) => effect.entity === delta.entity && effect.id === delta.id)));
        const resolution = this.options.resolver.resolve({
            entity: delta.entity,
            id: delta.id,
            local,
            remote,
            delta,
            localDirtyFields: this.options.queue.dirtyFields(delta.entity, delta.id),
            pendingMutations,
        });
        this.applyResolution(delta, resolution);
    }
    applyResolution(delta, resolution) {
        if (resolution.action === 'manual') {
            const mutationIds = this.options.queue.mutationIdsFor(delta.entity, delta.id);
            this.options.queue.mark(mutationIds, 'conflicted', resolution.reason || 'Manual resolution required.');
            this.emit({ type: 'conflict', delta, mutationIds, reason: resolution.reason });
            return;
        }
        if (resolution.action === 'delete') {
            this.options.store.delete(delta.entity, delta.id);
        }
        else if (resolution.value) {
            this.options.store.upsert(delta.entity, resolution.value);
        }
        this.emit({ type: 'delta-applied', delta, resolution: resolution.action });
    }
    runExclusive(operation) {
        const next = this.operationChain.then(operation, operation);
        this.operationChain = next.then(() => undefined, () => undefined);
        return next;
    }
    refreshStatus(patch = {}) {
        this.currentStatus = {
            ...this.currentStatus,
            pendingCount: this.options.queue.count('queued') + this.options.queue.count('syncing'),
            failedCount: this.options.queue.count('failed'),
            conflictedCount: this.options.queue.count('conflicted'),
            cursor: this.meta.cursor ?? null,
            ...patch,
        };
        this.emit({ type: 'status', status: this.status() });
    }
    emit(event) {
        this.eventHistory.push({ ...structuredClone(event), at: this.now() });
        if (this.eventHistory.length > 500) {
            this.eventHistory.splice(0, this.eventHistory.length - 500);
        }
        for (const listener of this.listeners)
            listener(event);
    }
    async persistQueue() {
        await this.options.storage.saveMutations(this.options.queue.all());
    }
    async persistAll() {
        await persistSyncState(this.options.storage, {
            entities: this.options.store.getSnapshot(),
            mutations: this.options.queue.all(),
            meta: this.meta,
        });
    }
}
//# sourceMappingURL=sync-engine.js.map