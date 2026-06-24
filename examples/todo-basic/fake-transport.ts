import type {
  EntitySnapshot,
  PullRequest,
  PullResult,
  PushRequest,
  PushResult,
  SyncTransport,
} from '../../packages/core/src/index';
import { TodoReferenceServer } from './reference-server';

export class FakeTodoTransport implements SyncTransport {
  constructor(private readonly server = new TodoReferenceServer()) {}

  async push(request: PushRequest): Promise<PushResult> {
    return this.server.push(request);
  }

  async pull(request: PullRequest): Promise<PullResult> {
    return this.server.pull(request);
  }

  snapshot(): EntitySnapshot {
    return this.server.snapshot();
  }
}
