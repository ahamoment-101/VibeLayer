# Contributing

## Development

```bash
npm install
npm run verify
```

`npm run verify` is the contribution gate. It covers typecheck, deterministic
tests, package builds, and an installed-tarball smoke test.

## Design Rules

- Keep Core framework-independent.
- Do not add product-specific entities, routes, auth, or UI concerns to Core.
- All writes must go through named mutations.
- New sync behavior must include deterministic tests for restart, retry, and
  stale response ordering.
- Agent-facing contract output must remain explicit and stable.
- Consumer application tests belong in the consumer repository, not in this
  workspace.

## Pull Requests

- Keep changes focused.
- Update docs when public API or contract surface changes.
- Include at least one verification case for every new reliability rule.
