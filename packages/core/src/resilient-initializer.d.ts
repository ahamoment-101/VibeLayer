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
export declare class ResilientInitializer<T> {
    private readonly options;
    private resource;
    private inflight;
    private retryTimer;
    private listeners;
    private state;
    private readonly now;
    private readonly setTimer;
    private readonly clearTimer;
    constructor(options: ResilientInitializerOptions<T>);
    start(): Promise<T>;
    get(): Promise<T>;
    current(): T | null;
    status(): InitializerStatus;
    subscribe(listener: StatusListener): () => void;
    dispose(): void;
    private cancelRetry;
    private update;
}
export declare function createResilientInitializer<T>(options: ResilientInitializerOptions<T>): ResilientInitializer<T>;
export {};
//# sourceMappingURL=resilient-initializer.d.ts.map