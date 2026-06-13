export class ResilientInitializer {
    options;
    resource = null;
    inflight = null;
    retryTimer = null;
    listeners = new Set();
    state = {
        phase: 'idle',
        attempts: 0,
        nextRetryAt: null,
        lastError: null,
    };
    now;
    setTimer;
    clearTimer;
    constructor(options) {
        this.options = options;
        this.now = options.now || (() => Date.now());
        this.setTimer = options.setTimer || ((callback, delay) => setTimeout(callback, delay));
        this.clearTimer = options.clearTimer || ((timer) => clearTimeout(timer));
    }
    start() {
        if (this.resource)
            return Promise.resolve(this.resource);
        if (this.inflight)
            return this.inflight;
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
            if (this.state.phase === 'disposed')
                throw error;
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
            if (this.inflight === operation)
                this.inflight = null;
        });
        this.inflight = operation;
        return operation;
    }
    get() {
        return this.resource ? Promise.resolve(this.resource) : this.start();
    }
    current() {
        return this.resource;
    }
    status() {
        return { ...this.state };
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.status());
        return () => this.listeners.delete(listener);
    }
    dispose() {
        if (this.state.phase === 'disposed')
            return;
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
    cancelRetry() {
        if (this.retryTimer === null)
            return;
        this.clearTimer(this.retryTimer);
        this.retryTimer = null;
    }
    update(patch) {
        this.state = { ...this.state, ...patch };
        const snapshot = this.status();
        for (const listener of this.listeners)
            listener(snapshot);
    }
}
export function createResilientInitializer(options) {
    return new ResilientInitializer(options);
}
//# sourceMappingURL=resilient-initializer.js.map