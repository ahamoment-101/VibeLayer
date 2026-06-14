# vibelayer-cli

Inspect a VibeLayer schema and mutation contract from JavaScript or TypeScript,
especially from coding agents and CI.

The CLI emits deterministic, stdout-friendly output for developers, CI, and
coding agents.

## Install

```bash
npm install --save-dev vibelayer-cli
```

## Create a Contract Module

```ts
import { createAgentContract } from 'vibelayer';
import { mutations } from './mutations';
import { schema } from './schema';

export const contract = createAgentContract(schema, mutations);
```

The module may export other values. The CLI selects the exported object whose
`protocolVersion` is `1` and which contains entity and mutation arrays.

## Commands

Print the complete JSON contract:

```bash
npx vibelayer inspect --module ./sync/contract.ts
```

List discoverable entities or mutations:

```bash
npx vibelayer list entities --module ./sync/contract.ts
npx vibelayer list mutations --module ./sync/contract.ts
```

Explain one entity or mutation:

```bash
npx vibelayer explain todo --module ./sync/contract.ts
npx vibelayer explain todo.updateTitle --module ./sync/contract.ts
```

Paths are resolved from the current working directory. JavaScript and
TypeScript contract modules are supported.

See the [VibeLayer repository](https://github.com/ahamoment-101/VibeLayer) for
the complete example and integration guide.

## License

MIT
