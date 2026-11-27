import { readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));
const baseConfig = 'tsconfig.base.json';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readObject(root, file, errors) {
  let source;
  try {
    source = await readFile(join(root, file), 'utf8');
  } catch (error) {
    errors.push(`${file}: could not read file (${error.code}).`);
    return;
  }

  try {
    const parsed = JSON.parse(source.replace(/^\uFEFF/u, ''));
    if (isObject(parsed)) {
      return parsed;
    }
  } catch {
    // The path and expected format are enough to locate and correct the problem.
  }
  errors.push(`${file}: expected a JSON object.`);
}

export async function checkWorkspace(root = workspaceRoot) {
  const errors = [];
  const base = await readObject(root, baseConfig, errors);
  if (base && base.compilerOptions?.strict !== true) {
    errors.push(`${baseConfig}: set compilerOptions.strict to true.`);
  }

  let entries;
  try {
    entries = await readdir(join(root, 'packages'), { withFileTypes: true });
  } catch (error) {
    errors.push(`packages: could not list workspace packages (${error.code}).`);
    return errors;
  }
  const packages = entries.filter(
    (entry) => entry.isDirectory() || entry.isSymbolicLink(),
  );
  if (packages.length === 0) {
    errors.push('packages: expected at least one workspace package directory.');
  }
  packages.sort((left, right) => left.name.localeCompare(right.name, 'en'));

  for (const entry of packages) {
    const directory = `packages/${entry.name}`;
    if (entry.isSymbolicLink()) {
      errors.push(
        `${directory}: expected a package directory without a symbolic link.`,
      );
      continue;
    }

    const manifestFile = `${directory}/package.json`;
    const manifest = await readObject(root, manifestFile, errors);
    if (manifest && manifest.private !== true) {
      errors.push(`${manifestFile}: set private to true.`);
    }

    const buildFile = `${directory}/tsconfig.build.json`;
    const build = await readObject(root, buildFile, errors);
    if (!build) {
      continue;
    }

    const buildDirectory = dirname(join(root, buildFile));
    if (
      typeof build.extends !== 'string' ||
      !/^\.\.?\//u.test(build.extends) ||
      resolve(buildDirectory, build.extends) !== resolve(root, baseConfig)
    ) {
      errors.push(`${buildFile}: extend ../../${baseConfig} directly.`);
    }
    if (
      build.compilerOptions !== undefined &&
      (!isObject(build.compilerOptions) ||
        (Object.hasOwn(build.compilerOptions, 'strict') &&
          build.compilerOptions.strict !== true))
    ) {
      errors.push(`${buildFile}: compilerOptions must preserve strict mode.`);
    }
  }
  return errors;
}

const entryPath = process.argv[1]
  ? await realpath(process.argv[1]).catch(() => undefined)
  : undefined;
const modulePath = await realpath(fileURLToPath(import.meta.url));
const isEntrypoint =
  entryPath !== undefined &&
  (process.platform === 'win32'
    ? entryPath.toLowerCase() === modulePath.toLowerCase()
    : entryPath === modulePath);
if (isEntrypoint) {
  const errors = await checkWorkspace();
  if (errors.length > 0) {
    process.stderr.write(`${errors.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('Workspace package configuration is valid.\n');
  }
}
