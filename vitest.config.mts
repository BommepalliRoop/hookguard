import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'scripts/orchestrator/*.mjs'],
      reporter: ['text', 'lcov'],
    },
  },
});
