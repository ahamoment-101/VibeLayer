import { describe, expect, it, vi } from 'vitest';
import { createResilientInitializer } from '../packages/core/src/index';

describe('ResilientInitializer', () => {
  it('recovers automatically after transient initialization failures', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const initializer = createResilientInitializer<{ id: string }>({
      create: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('temporarily unavailable');
        return { id: 'resource' };
      },
      retryDelay: () => 100,
    });

    await expect(initializer.start()).rejects.toThrow('temporarily unavailable');
    expect(initializer.status()).toMatchObject({
      phase: 'degraded',
      attempts: 1,
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(initializer.status()).toMatchObject({
      phase: 'degraded',
      attempts: 2,
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(initializer.get()).resolves.toEqual({ id: 'resource' });
    expect(initializer.status()).toMatchObject({
      phase: 'ready',
      attempts: 3,
      lastError: null,
    });
    initializer.dispose();
    vi.useRealTimers();
  });

  it('lets a user action trigger an immediate retry while degraded', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const initializer = createResilientInitializer<string>({
      create: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('first attempt failed');
        return 'ready';
      },
      retryDelay: () => 30000,
    });

    await expect(initializer.start()).rejects.toThrow('first attempt failed');
    await expect(initializer.get()).resolves.toBe('ready');
    expect(attempts).toBe(2);
    expect(initializer.status().phase).toBe('ready');
    initializer.dispose();
    vi.useRealTimers();
  });

  it('does not retry permanent failures and disposes late resources', async () => {
    let resolveCreate!: (value: { id: string }) => void;
    const disposed: string[] = [];
    const initializer = createResilientInitializer<{ id: string }>({
      create: () => new Promise((resolve) => {
        resolveCreate = resolve;
      }),
      shouldRetry: () => false,
      disposeResource: (resource) => disposed.push(resource.id),
    });

    const pending = initializer.start();
    initializer.dispose();
    resolveCreate({ id: 'late' });

    await expect(pending).rejects.toThrow('disposed');
    expect(disposed).toEqual(['late']);
    expect(initializer.status().phase).toBe('disposed');
  });
});
