import type {
  EntitySnapshot,
  MutationRecord,
  StorageAdapter,
  StorageMeta,
} from './types.js';

export class MemoryStorageAdapter implements StorageAdapter {
  private entities: EntitySnapshot = {};
  private mutations: MutationRecord[] = [];
  private meta: StorageMeta = {};

  async loadEntities(): Promise<EntitySnapshot> {
    return structuredClone(this.entities);
  }

  async saveEntities(snapshot: EntitySnapshot): Promise<void> {
    this.entities = structuredClone(snapshot);
  }

  async loadMutations(): Promise<MutationRecord[]> {
    return structuredClone(this.mutations);
  }

  async saveMutations(mutations: MutationRecord[]): Promise<void> {
    this.mutations = structuredClone(mutations);
  }

  async loadMeta(): Promise<StorageMeta> {
    return structuredClone(this.meta);
  }

  async saveMeta(meta: StorageMeta): Promise<void> {
    this.meta = structuredClone(meta);
  }

  async saveState(state: {
    entities: EntitySnapshot;
    mutations: MutationRecord[];
    meta?: StorageMeta;
  }): Promise<void> {
    this.entities = structuredClone(state.entities);
    this.mutations = structuredClone(state.mutations);
    if (state.meta) this.meta = structuredClone(state.meta);
  }
}
