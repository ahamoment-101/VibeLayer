import { resolve } from 'node:path';
import type { AgentContract } from 'vibelayer';
import { tsImport } from 'tsx/esm/api';

type ContractModule = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`${message}\n\n${usage()}`);
}

function usage(): string {
  return [
    'Usage:',
    '  vibelayer inspect --module <contract.ts>',
    '  vibelayer list entities|mutations --module <contract.ts>',
    '  vibelayer explain <entity-or-mutation> --module <contract.ts>',
    '',
    'The module must export an AgentContract object.',
  ].join('\n');
}

async function loadContract(modulePath: string): Promise<AgentContract> {
  const imported = await tsImport(resolve(modulePath), import.meta.url) as ContractModule;
  const contract = Object.values(imported).find((value) => (
    value
    && typeof value === 'object'
    && (value as AgentContract).protocolVersion === 1
    && Array.isArray((value as AgentContract).entities)
    && Array.isArray((value as AgentContract).mutations)
  ));
  if (!contract) {
    fail(`No AgentContract export found in "${modulePath}".`);
  }
  return contract as AgentContract;
}

function parseArguments(argv: string[]): {
  command: string;
  subject?: string;
  modulePath: string;
} {
  const [command, subject] = argv;
  const moduleIndex = argv.indexOf('--module');
  const modulePath = moduleIndex >= 0 ? argv[moduleIndex + 1] : undefined;
  if (!command || !modulePath) fail('Missing command or --module.');
  return { command, subject, modulePath };
}

async function main(): Promise<void> {
  const { command, subject, modulePath } = parseArguments(process.argv.slice(2));
  const contract = await loadContract(modulePath);

  if (command === 'inspect') {
    process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
    return;
  }
  if (command === 'list' && subject === 'entities') {
    for (const entity of contract.entities) {
      process.stdout.write(`${entity.name}\t${entity.description || ''}\n`);
    }
    return;
  }
  if (command === 'list' && subject === 'mutations') {
    for (const mutation of contract.mutations) {
      process.stdout.write(`${mutation.name}\t${mutation.description}\n`);
    }
    return;
  }
  if (command === 'explain' && subject) {
    const mutation = contract.mutations.find((candidate) => candidate.name === subject);
    if (mutation) {
      process.stdout.write(`${JSON.stringify({ kind: 'mutation', ...mutation }, null, 2)}\n`);
      return;
    }
    const entity = contract.entities.find((candidate) => candidate.name === subject);
    if (entity) {
      process.stdout.write(`${JSON.stringify({ kind: 'entity', ...entity }, null, 2)}\n`);
      return;
    }
    fail(`Unknown entity or mutation "${subject}".`);
  }
  fail(`Unknown command "${command}${subject ? ` ${subject}` : ''}".`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
