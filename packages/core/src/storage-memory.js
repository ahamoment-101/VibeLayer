export class MemoryStorageAdapter {
    entities = {};
    mutations = [];
    meta = {};
    async loadEntities() {
        return structuredClone(this.entities);
    }
    async saveEntities(snapshot) {
        this.entities = structuredClone(snapshot);
    }
    async loadMutations() {
        return structuredClone(this.mutations);
    }
    async saveMutations(mutations) {
        this.mutations = structuredClone(mutations);
    }
    async loadMeta() {
        return structuredClone(this.meta);
    }
    async saveMeta(meta) {
        this.meta = structuredClone(meta);
    }
    async saveState(state) {
        this.entities = structuredClone(state.entities);
        this.mutations = structuredClone(state.mutations);
        if (state.meta)
            this.meta = structuredClone(state.meta);
    }
}
//# sourceMappingURL=storage-memory.js.map