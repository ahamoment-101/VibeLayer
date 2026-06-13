import { describe, expect, it } from 'vitest';
import { todoContract } from '../examples/todo-basic/contract';

describe('Agent contract', () => {
  it('describes schema fields, mutation capabilities, and verification requirements', () => {
    const contract = todoContract;

    expect(contract.protocolVersion).toBe(1);
    expect(contract.entities.find((entity) => entity.name === 'todo')?.fields)
      .toContainEqual(expect.objectContaining({
        name: 'memo',
        durableDraft: true,
        conflict: 'localDirtyWins',
      }));
    expect(contract.mutations.find((mutation) => mutation.name === 'todo.updateMemo'))
      .toMatchObject({
        description: 'Update durable todo memo text.',
        affects: ['todo.memo'],
      });
    expect(contract.verification.requiredScenarios).toContain('offline-restart-recovery');
  });
});
