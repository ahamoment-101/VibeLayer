import { getFieldConflictPolicy } from './schema.js';
export const conflictPolicies = {
    remoteWins: ({ remote }) => (remote
        ? { action: 'useRemote', value: remote }
        : { action: 'delete' }),
    localWins: ({ local, remote, localDirtyFields }) => (localDirtyFields.has('__deleted')
        ? { action: 'delete', reason: 'Pending local delete wins.' }
        : local
            ? { action: 'useLocal', value: local }
            : remote
                ? { action: 'useRemote', value: remote }
                : { action: 'delete' }),
    localDirtyWins: ({ local, remote, localDirtyFields }) => {
        if (localDirtyFields.has('__deleted')) {
            return { action: 'delete', reason: 'Pending local delete wins.' };
        }
        if (!remote) {
            return localDirtyFields.size && local
                ? { action: 'useLocal', value: local, reason: 'Remote delete blocked by local dirty fields.' }
                : { action: 'delete' };
        }
        if (!local)
            return { action: 'useRemote', value: remote };
        const next = { ...remote };
        for (const field of localDirtyFields)
            next[field] = local[field];
        return { action: 'merge', value: next };
    },
    fieldLevelMerge: ({ schema, entity, local, remote, localDirtyFields }) => {
        if (localDirtyFields.has('__deleted')) {
            return { action: 'delete', reason: 'Pending local delete wins.' };
        }
        if (!remote) {
            const hasProtectedField = [...localDirtyFields].some((field) => (getFieldConflictPolicy(schema, entity, field) !== 'remoteWins'));
            return hasProtectedField && local
                ? { action: 'useLocal', value: local, reason: 'Remote delete blocked by protected dirty fields.' }
                : { action: 'delete' };
        }
        if (!local)
            return { action: 'useRemote', value: remote };
        const fields = new Set([...Object.keys(local), ...Object.keys(remote)]);
        const next = { ...remote };
        for (const field of fields) {
            const policy = getFieldConflictPolicy(schema, entity, field);
            if (policy === 'localWins') {
                next[field] = local[field];
            }
            else if (policy === 'localDirtyWins' && localDirtyFields.has(field)) {
                next[field] = local[field];
            }
        }
        return { action: 'merge', value: next };
    },
};
export class ConflictResolver {
    schema;
    policies;
    constructor(schema, customPolicies = {}) {
        this.schema = schema;
        this.policies = { ...conflictPolicies, ...customPolicies };
    }
    resolve(context) {
        const policyName = this.schema.entities[context.entity]?.conflict
            || this.schema.defaultConflict
            || 'remoteWins';
        const policy = this.policies[policyName];
        if (!policy) {
            throw new Error(`Unknown conflict policy "${policyName}" for "${context.entity}". `
                + 'Register it in SyncClient.create({ conflictPolicies }).');
        }
        return policy({ ...context, schema: this.schema });
    }
}
//# sourceMappingURL=conflict.js.map