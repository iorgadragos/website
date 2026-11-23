import { defineConfig } from 'vitest/config';

// Site unit tests + edge/ (CloudFront Function and security-header data).
export default defineConfig({
  test: { include: ['src/**/*.test.ts', 'edge/**/*.test.ts'] },
});
