import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Must match FILE_EXT in infra/lib/edge/rewrite.js: such paths are served as files, not pages.
const FILE_EXT = /\.(html|xml|txt|json|webmanifest|ico|svg|png|jpe?g|gif|webp|avif|css|js|mjs|map|woff2?|pdf)$/i;

describe('blog slugs', () => {
  it('never end in a file extension (the CDN would serve them as files and return 404)', () => {
    const dir = join(__dirname, '../content/blog');
    const slugs = readdirSync(dir).map((f) => f.replace(/\.mdx?$/, ''));
    for (const slug of slugs) expect(slug).not.toMatch(FILE_EXT);
  });
});
