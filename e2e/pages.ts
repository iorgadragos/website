import { readFileSync, readdirSync, existsSync } from 'node:fs';

// Every public page: the sitemap (the source of truth for indexable pages) plus every built blog post.
// Paths are relative, so the same list works against the preview server and the live site.
export function sitePages(): string[] {
  const xml = readFileSync('dist/sitemap-0.xml', 'utf8');
  const fromSitemap = [...xml.matchAll(/<loc>https:\/\/iorgadragos\.ro(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
  const blogDir = 'dist/blog';
  const posts = existsSync(blogDir)
    ? readdirSync(blogDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `/blog/${d.name}/`)
    : [];
  const pages = [...new Set([...fromSitemap, ...posts])].sort();
  if (pages.length < 5) throw new Error(`only ${pages.length} pages found: build the site first (npm run build)`);
  return pages;
}
