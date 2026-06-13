import type {
  EntitySnapshot,
  MutationRecord,
  StorageAdapter,
  StorageMeta,
} from './types.js';

export async function persistSyncState(
  storage: StorageAdapter,
  state: {
    entities: EntitySnapshot;
    mutations: MutationRecord[];
    meta?: StorageMeta;
  },
): Promise<void> {
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
