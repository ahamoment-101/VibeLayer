import type { SyncSchema } from './schema.js';
import type { MutationRegistry } from './types.js';
export type AgentContract = {
    protocolVersion: 1;
    principles: string[];
    entities: Array<{
        name: string;
        description?: string;
        primaryKey: string;
        conflict: string;
        fields: Array<{
            name: string;
            type: string;
            description?: string;
            userEditable: boolean;
            durableDraft: boolean;
            conflict: string;
        }>;
    }>;
    mutations: Array<{
        name: string;
        description: string;
        affects: string[];
    }>;
    verification: {
        requiredScenarios: string[];
    };
};
export declare function createAgentContract(schema: SyncSchema, mutations: MutationRegistry): AgentContract;
//# sourceMappingURL=agent-contract.d.ts.map