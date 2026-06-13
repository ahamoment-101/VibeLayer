import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const workspace = path.resolve(import.meta.dirname, '..');
const coreDirectory = path.join(workspace, 'packages', 'core');
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'vibelayer-install-'));
const npmEnvironment = {
  ...process.env,
  NPM_CONFIG_CACHE: path.join(temporaryDirectory, 'npm-cache'),
};
let packedTarball = null;

try {
  const { stdout } = await execFileAsync('npm', ['pack', '--json'], {
    cwd: coreDirectory,
    env: npmEnvironment,
  });
  const [{ filename, files }] = JSON.parse(stdout);
  packedTarball = path.join(coreDirectory, filename);
  const packedPaths = new Set(files.map((file) => file.path));
  for (const requiredPath of ['package.json', 'README.md', 'dist/index.js', 'dist/index.d.ts']) {
    if (!packedPaths.has(requiredPath)) {
      throw new Error(`Packed vibelayer is missing "${requiredPath}".`);
    }
  }

  await writeFile(path.join(temporaryDirectory, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
  }));
  await execFileAsync('npm', [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    packedTarball,
  ], {
    cwd: temporaryDirectory,
    env: npmEnvironment,
  });

  const smokePath = path.join(temporaryDirectory, 'smoke.mjs');
  await writeFile(smokePath, `
    import { MemoryStorageAdapter, SyncClient, defineMutations, defineSchema } from 'vibelayer';
    const schema = defineSchema({
      entities: { item: { fields: { title: { type: 'string', conflict: 'localDirtyWins' } } } },
    });
    const mutations = defineMutations({
      'item.create': {
        description: 'Create an item.',
        affects: ['item'],
        apply({ tx }, input) { tx.upsert('item', input); },
      },
    });
    const client = await SyncClient.create({
      schema,
      mutations,
      storage: new MemoryStorageAdapter(),
      transport: {
        async push(request) {
          return { ackedMutationIds: request.mutations.map((mutation) => mutation.id) };
        },
      },
    });
    await client.mutate('item.create', { id: 'item_1', title: 'Installed package works' });
    if (client.store.get('item', 'item_1')?.title !== 'Installed package works') {
      throw new Error('Installed package did not execute a local mutation.');
    }
    await client.sync.push();
    if (client.sync.inspectQueue().length !== 0) {
      throw new Error('Installed package did not flush its queue.');
    }
  `);
  await execFileAsync(process.execPath, [smokePath], { cwd: temporaryDirectory });

  const manifest = JSON.parse(await readFile(
    path.join(temporaryDirectory, 'node_modules', 'vibelayer', 'package.json'),
    'utf8',
  ));
  console.log(`Packed and installed ${manifest.name}@${manifest.version} successfully.`);
} finally {
  if (packedTarball) await rm(packedTarball, { force: true });
  await rm(temporaryDirectory, { recursive: true, force: true });
}
