import { createAgentContract } from '../../packages/core/src/index';
import { addioTodoMutations } from './mutations';
import { addioTodoSchema } from './schema';

export const addioTodoContract = createAgentContract(
  addioTodoSchema,
  addioTodoMutations,
);
