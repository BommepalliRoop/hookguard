import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadScenario, readFixture } from '@hookguard/schema';
import { expect, it, vi } from 'vitest';
import { runCli } from '../src/program.js';

it('creates and guides validation of a synthetic Express scenario', async ({
  onTestFinished,
}) => {
  const root = await mkdtemp(join(tmpdir(), 'hookguard-init-'));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'express example');
  const output = { writeErr: vi.fn(), writeOut: vi.fn() };
  expect(
    await runCli(['init', '--template', 'express', directory], output),
  ).toBe(0);
  expect(output.writeErr).not.toHaveBeenCalled();
  expect(output.writeOut).toHaveBeenCalledWith(
    expect.stringContaining('hookguard validate --config'),
  );
  const config = join(directory, 'hookguard.yaml');
  const scenario = await loadScenario(config);
  expect(scenario).toMatchObject({
    scenario: 'duplicate',
    execution: { count: 3 },
    security: { allowTargets: ['http://127.0.0.1:3000'] },
  });
  const fixture = await readFixture(config, scenario.fixture.path);
  expect(JSON.parse(fixture.toString())).toMatchObject({
    id: 'evt_payment_001',
    type: 'payment.captured',
  });
});

it('keeps an existing destination intact on retries, including concurrent init', async ({
  onTestFinished,
}) => {
  const root = await mkdtemp(join(tmpdir(), 'hookguard-init-'));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'sample');
  const options = () => ({ writeErr: vi.fn(), writeOut: vi.fn() });
  const statuses = await Promise.all(
    [options(), options()].map((output) => runCli(['init', directory], output)),
  );
  expect(statuses.sort()).toEqual([0, 2]);
  expect((await readdir(directory)).sort()).toEqual([
    'hookguard.yaml',
    'payment-captured.json',
  ]);
  const config = join(directory, 'hookguard.yaml');
  const content = await readFile(config, 'utf8');
  const output = options();
  expect(await runCli(['init', directory], output)).toBe(2);
  expect(output.writeErr).toHaveBeenCalledWith(
    expect.stringContaining('already exists'),
  );
  expect(await readFile(config, 'utf8')).toBe(content);
});

it('rejects unknown templates before creating files', async ({
  onTestFinished,
}) => {
  const root = await mkdtemp(join(tmpdir(), 'hookguard-init-'));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const output = { writeErr: vi.fn(), writeOut: vi.fn() };
  expect(
    await runCli(
      ['init', '--template', 'unknown', join(root, 'sample')],
      output,
    ),
  ).toBe(2);
  expect(await readdir(root)).toEqual([]);
});
