import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const version = process.argv[2] ?? '0.1.0-alpha.1';
const packageManager = process.env.npm_execpath;

assert(
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-alpha\.(?:0|[1-9]\d*)$/u.test(
    version,
  ),
  'Use an alpha version such as 0.1.0-alpha.1.',
);
assert(packageManager, 'Run this script via pnpm package:cli.');

const modules = {
  cli: 'dist',
  engine: 'dist/engine/dist',
  schema: 'dist/schema/dist',
};

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
}

async function stageCode(stage, packedFiles) {
  for (const [module, directory] of Object.entries(modules)) {
    const source = join(root, 'packages', module);
    await mkdir(join(stage, directory), { recursive: true });
    const files = await readdir(join(source, 'src'), { withFileTypes: true });
    assert(files.some((file) => file.isFile() && file.name === 'index.ts'));
    for (const file of files) {
      if (
        !file.isFile() ||
        !file.name.endsWith('.ts') ||
        file.name.endsWith('.d.ts')
      )
        continue;
      const compiled = file.name.slice(0, -3) + '.js';
      const path = posix.join(directory, compiled);
      const script = await readFile(join(source, 'dist', compiled), 'utf8');
      const staged = script
        .replace(
          /(\bfrom\s+)(['"])@hookguard\/(engine|schema)\2/gu,
          (_specifier, prefix, quote, dependency) => {
            const relative = posix.relative(directory, modules[dependency]);
            return prefix + quote + './' + relative + '/index.js' + quote;
          },
        )
        .replace(/^\/\/# sourceMappingURL=.*$/gmu, '');
      assert(
        !/['"]@hookguard\//u.test(staged),
        'Unresolved workspace import in ' + path,
      );
      await writeFile(join(stage, path), staged);
      packedFiles.add(path);
    }
  }
}

async function collectDependencies() {
  const dependencies = {};
  const notices = [
    'Third-party licenses',
    '',
    'The CLI installs the following runtime dependencies from npm.',
  ];
  for (const module of ['cli', 'schema', 'engine']) {
    const directory = join(root, 'packages', module);
    const manifest = await readJson(join(directory, 'package.json'));
    for (const [name, version] of Object.entries(manifest.dependencies)) {
      if (version.startsWith('workspace:')) {
        assert(name === '@hookguard/engine' || name === '@hookguard/schema');
        continue;
      }
      const dependency = join(directory, 'node_modules', name);
      const installed = await readJson(join(dependency, 'package.json'));
      assert.equal(
        installed.version,
        version,
        name + ' must be pinned to the installed version.',
      );
      assert.equal(
        Object.keys(installed.dependencies ?? {}).length,
        0,
        name + ' adds a transitive dependency; review distribution notices.',
      );
      assert(
        ['MIT', 'ISC'].includes(installed.license),
        name + ' requires license review.',
      );
      dependencies[name] = version;
      notices.push(
        '',
        name + '@' + version + ' (' + installed.license + ')',
        (await readFile(join(dependency, 'LICENSE'), 'utf8')).trimEnd(),
      );
    }
  }
  return { dependencies, notices: notices.join('\n') + '\n' };
}

const stage = await mkdtemp(join(tmpdir(), 'hookguard-pack-'));
const packedFiles = new Set([
  'package.json',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.txt',
  'dist/engine/package.json',
]);

try {
  const workspace = await readJson(join(root, 'package.json'));
  const cli = await readJson(join(root, 'packages/cli/package.json'));
  const { dependencies, notices } = await collectDependencies();
  await stageCode(stage, packedFiles);
  assert(packedFiles.has(cli.bin.hookguard), 'CLI entry point is missing.');
  await writeJson(join(stage, 'dist/engine/package.json'), {
    version,
    type: 'module',
  });
  await copyFile(join(root, 'LICENSE'), join(stage, 'LICENSE'));
  await copyFile(
    join(root, 'packages/cli/README.md'),
    join(stage, 'README.md'),
  );
  await writeFile(join(stage, 'THIRD_PARTY_NOTICES.txt'), notices);
  await writeJson(join(stage, 'package.json'), {
    name: cli.name,
    version,
    private: true,
    description: cli.description,
    license: cli.license,
    repository: cli.repository,
    bugs: cli.bugs,
    homepage: cli.homepage,
    engines: workspace.engines,
    type: cli.type,
    bin: cli.bin,
    files: ['dist', 'THIRD_PARTY_NOTICES.txt'],
    dependencies,
  });

  const pack = ['pack', '--json', '--out', 'hookguard-cli.tgz'];
  const { stdout } = /\.[cm]?js$/u.test(packageManager)
    ? await execute(process.execPath, [packageManager, ...pack], { cwd: stage })
    : await execute(packageManager, pack, { cwd: stage });
  const manifest = JSON.parse(stdout);
  assert.equal(manifest.name, cli.name);
  assert.equal(manifest.version, version);
  assert.deepEqual(
    new Set(manifest.files.map(({ path }) => path)),
    packedFiles,
  );

  const destination = join(root, 'dist', 'release');
  await mkdir(destination, { recursive: true });
  const artifact = join(destination, 'hookguard-cli-' + version + '.tgz');
  await copyFile(join(stage, manifest.filename), artifact);
  process.stdout.write(artifact + '\n');
} finally {
  await rm(stage, { recursive: true, force: true });
}
