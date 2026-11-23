import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { dirname, resolve, sep, win32 } from 'node:path';

const maxBytes = 1024 * 1024;

export class FixtureError extends Error {
  override name = 'FixtureError';
}

function assertInside(root: string, file: string) {
  if (
    !file.startsWith(root.endsWith(sep) ? root : root + sep) ||
    file === root
  ) {
    throw new FixtureError('Fixture must be inside the scenario directory.');
  }
}

export async function readFixture(
  configPath: string,
  fixturePath: string,
): Promise<Buffer> {
  if (
    !fixturePath ||
    win32.isAbsolute(fixturePath) ||
    /[:\0]/u.test(fixturePath)
  ) {
    throw new FixtureError('Fixture must be a relative file path.');
  }
  const parts = fixturePath.split(/[\\/]/u);
  // Windows can interpret these names as devices even inside a normal directory.
  if (
    parts.some((part) =>
      /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(part),
    )
  ) {
    throw new FixtureError('Fixture must be a regular file.');
  }

  try {
    const root = await realpath(dirname(resolve(configPath)));
    const candidate = resolve(root, parts.join(sep));
    assertInside(root, candidate);
    const canonical = await realpath(candidate);
    assertInside(root, canonical);
    const expected = await stat(canonical, { bigint: true });
    if (!expected.isFile())
      throw new FixtureError('Fixture must be a regular file.');

    // Nonblocking open avoids hanging on a substituted FIFO where supported.
    const flags =
      constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0);
    const handle = await open(canonical, flags);
    try {
      const opened = await handle.stat({ bigint: true });
      if (
        !opened.isFile() ||
        opened.dev !== expected.dev ||
        opened.ino !== expected.ino
      ) {
        throw new FixtureError('Fixture changed while opening.');
      }
      // Node has no portable openat primitive. Recheck containment after opening
      // and read only from the verified handle. Scenario directories must be
      // protected from concurrent hostile modifications.
      if ((await realpath(candidate)) !== canonical)
        throw new FixtureError('Fixture changed while opening.');
      if (opened.size > BigInt(maxBytes))
        throw new FixtureError('Fixture exceeds the 1 MiB limit.');
      const length = Number(opened.size);
      const buffer = Buffer.alloc(length + 1);
      let used = 0;
      while (used < buffer.length) {
        const { bytesRead } = await handle.read(
          buffer,
          used,
          buffer.length - used,
          null,
        );
        if (bytesRead === 0) break;
        used += bytesRead;
      }
      if (used !== length)
        throw new FixtureError('Fixture changed size while reading.');
      return buffer.subarray(0, used);
    } finally {
      await handle.close();
    }
  } catch (cause) {
    if (cause instanceof FixtureError) throw cause;
    throw new FixtureError('Unable to read fixture file.', { cause });
  }
}
