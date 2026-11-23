import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'scripts/orchestrator/*.mjs'],
      exclude: ['scripts/orchestrator/test-fixture.mjs'],
      reporter: ['text', 'lcov'],
    },
  },
});
