export type InitializerPhase = 'idle' | 'initializing' | 'ready' | 'degraded' | 'disposed';

export type InitializerStatus = {
  phase: InitializerPhase;
  attempts: number;
  nextRetryAt: number | null;
  lastError: string | null;
};

export type ResilientInitializerOptions<T> = {
  create: () => Promise<T>;
  disposeResource?: (resource: T) => void;
  shouldRetry?: (error: unknown) => boolean;
  retryDelay?: (attempt: number) => number;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => unknown;
  clearTimer?: (timer: unknown) => void;
};

type StatusListener = (status: InitializerStatus) => void;

export class ResilientInitializer<T> {
  private resource: T | null = null;
  private inflight: Promise<T> | null = null;
  private retryTimer: unknown = null;
  private listeners = new Set<StatusListener>();
  private state: InitializerStatus = {
    phase: 'idle',
    attempts: 0,
    nextRetryAt: null,
    lastError: null,
  };

  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, delay: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;

  constructor(private readonly options: ResilientInitializerOptions<T>) {
    this.now = options.now || (() => Date.now());
    this.setTimer = options.setTimer || ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer = options.clearTimer || ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  }

  start(): Promise<T> {
    if (this.resource) return Promise.resolve(this.resource);
    if (this.inflight) return this.inflight;
    if (this.state.phase === 'disposed') {
      return Promise.reject(new Error('Initializer has been disposed.'));
    }

    this.cancelRetry();
    const attempt = this.state.attempts + 1;
    this.update({
      phase: 'initializing',
      attempts: attempt,
      nextRetryAt: null,
      lastError: null,
    });

    const operation = this.options.create()
      .then((resource) => {
        if (this.state.phase === 'disposed') {
          this.options.disposeResource?.(resource);
          throw new Error('Initializer was disposed during resource creation.');
        }
        this.resource = resource;
        this.update({
          phase: 'ready',
          attempts: attempt,
          nextRetryAt: null,
          lastError: null,
        });
        return resource;
      })
      .catch((error) => {
        if (this.state.phase === 'disposed') throw error;
        const message = error instanceof Error ? error.message : String(error);
        const shouldRetry = this.options.shouldRetry?.(error) ?? true;
        const delay = shouldRetry
          ? Math.max(0, this.options.retryDelay?.(attempt) ?? Math.min(1000 * (2 ** (attempt - 1)), 30000))
          : null;
        this.update({
          phase: 'degraded',
          attempts: attempt,
          nextRetryAt: delay === null ? null : this.now() + delay,
          lastError: message,
        });
        if (delay !== null) {
          this.retryTimer = this.setTimer(() => {
            this.retryTimer = null;
            this.start().catch(() => null);
          }, delay);
        }
        throw error;
      })
      .finally(() => {
        if (this.inflight === operation) this.inflight = null;
      });

    this.inflight = operation;
    return operation;
  }

  get(): Promise<T> {
    return this.resource ? Promise.resolve(this.resource) : this.start();
  }

  current(): T | null {
    return this.resource;
  }

  status(): InitializerStatus {
    return { ...this.state };
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status());
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.state.phase === 'disposed') return;
    this.cancelRetry();
    if (this.resource) {
      this.options.disposeResource?.(this.resource);
      this.resource = null;
    }
    this.update({
      phase: 'disposed',
      nextRetryAt: null,
    });
    this.listeners.clear();
  }

  private cancelRetry(): void {
    if (this.retryTimer === null) return;
    this.clearTimer(this.retryTimer);
    this.retryTimer = null;
  }

  private update(patch: Partial<InitializerStatus>): void {
    this.state = { ...this.state, ...patch };
    const snapshot = this.status();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export function createResilientInitializer<T>(
  options: ResilientInitializerOptions<T>,
): ResilientInitializer<T> {
  return new ResilientInitializer(options);
}
