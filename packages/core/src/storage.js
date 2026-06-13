export async function persistSyncState(storage, state) {
    if (storage.saveState) {
        await storage.saveState(state);
        return;
    }
    await Promise.all([
        storage.saveEntities(state.entities),
        storage.saveMutations(state.mutations),
        state.meta ? storage.saveMeta?.(state.meta) : undefined,
    ]);
}
//# sourceMappingURL=storage.js.map