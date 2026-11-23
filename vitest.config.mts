import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@hookguard/schema': fileURLToPath(
        new URL('./packages/schema/src/index.ts', import.meta.url),
      ),
      '@hookguard/engine': fileURLToPath(
        new URL('./packages/engine/src/index.ts', import.meta.url),
      ),
      '@hookguard/express-consumer': fileURLToPath(
        new URL('./examples/express-consumer/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    maxWorkers: 2,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'scripts/orchestrator/*.mjs'],
      exclude: ['scripts/orchestrator/test-fixture.mjs'],
      reporter: ['text', 'lcov'],
    },
  },
});
