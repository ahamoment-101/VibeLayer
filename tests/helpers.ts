import type {
  PullRequest,
  PullResult,
  PushRequest,
  PushResult,
  RemoteDelta,
  SyncTransport,
} from '../packages/core/src/index';

export function sequentialIds(prefix = 'id'): () => string {
  let index = 0;
  return () => `${prefix}_${++index}`;
}

export class TestTransport implements SyncTransport {
  online = true;
  pushes: PushRequest[] = [];
  pulls: PullRequest[] = [];
  pushDeltas: RemoteDelta[] = [];
  pullDeltas: RemoteDelta[] = [];
  rejected: PushResult['rejected'] = [];
  cursor = 0;

  async push(request: PushRequest): Promise<PushResult> {
    if (!this.online) throw new Error('network unavailable');
    this.pushes.push(structuredClone(request));
    return {
      ackedMutationIds: request.mutations
        .filter((mutation) => !this.rejected?.some((item) => item.mutationId === mutation.id))
        .map((mutation) => mutation.id),
      rejected: structuredClone(this.rejected),
      deltas: structuredClone(this.pushDeltas),
    };
  }

  async pull(request: PullRequest): Promise<PullResult> {
    if (!this.online) throw new Error('network unavailable');
    this.pulls.push(structuredClone(request));
    return {
      cursor: ++this.cursor,
      deltas: structuredClone(this.pullDeltas),
    };
  }
}
