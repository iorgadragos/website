import { readFileSync, readdirSync, existsSync } from 'node:fs';

// Pages that must always exist: a page dropping out of the build or the sitemap fails the suite.
export const REQUIRED = ['/', '/about/', '/blog/', '/book/', '/contact/', '/how-i-work/', '/legal/', '/services/', '/speaking/'];

// Every public page: the sitemap (the source of truth for indexable pages) plus every built blog post.
// Paths are relative, so the same list works against the preview server and the live site. Reads dist/ (build first).
export function sitePages(): string[] {
  const xml = readFileSync('dist/sitemap-0.xml', 'utf8');
  const fromSitemap = [...xml.matchAll(/<loc>https:\/\/iorgadragos\.ro(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
  const blogDir = 'dist/blog';
  const posts = existsSync(blogDir)
    ? readdirSync(blogDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `/blog/${d.name}/`)
    : [];
  const pages = [...new Set([...fromSitemap, ...posts])].sort();
  const missing = REQUIRED.filter((p) => !pages.includes(p));
  if (missing.length) throw new Error(`pages missing from the build/sitemap: ${missing.join(', ')} (build first: npm run build)`);
  return pages;
}

// The response headers CloudFront adds (edge/security-headers.json), for serving dist/ like production.
export function securityHeaders(): Record<string, string> {
  const H = JSON.parse(readFileSync('edge/security-headers.json', 'utf8'));
  const sts = H.strictTransportSecurity;
  return {
    'strict-transport-security': `max-age=${sts.maxAgeSeconds}${sts.includeSubdomains ? '; includeSubDomains' : ''}${sts.preload ? '; preload' : ''}`,
    'content-security-policy': H.contentSecurityPolicy,
    ...(H.contentTypeOptions ? { 'x-content-type-options': 'nosniff' } : {}),
    'x-frame-options': H.frameOptions,
    'referrer-policy': H.referrerPolicy,
    ...Object.fromEntries(Object.entries(H.customHeaders as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
  };
}
