import { defineConfig } from 'vitest/config';

// Site unit tests only; infra/ has its own vitest setup and dependencies.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
