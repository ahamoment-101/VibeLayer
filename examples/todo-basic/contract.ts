import { createAgentContract } from '../../packages/core/src/index';
import { mutations } from './mutations';
import { schema } from './schema';

export const todoContract = createAgentContract(schema, mutations);
