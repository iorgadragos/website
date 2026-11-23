import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, 'rewrite.js'), 'utf8').replaceAll('__DOMAIN__', 'example.com');
// eslint-disable-next-line no-new-func
const handler = new Function(`${src}; return handler;`)() as (e: unknown) => any;
const ev = (uri: string, host = 'example.com', querystring: Record<string, unknown> = {}) =>
  ({ request: { uri, headers: { host: { value: host } }, querystring } });

describe('viewer-request rewrite', () => {
  it.each([
    ['/', '/index.html'],
    ['/about', '/about/index.html'],
    ['/about/', '/about/index.html'],
    ['/blog/node.js-tips', '/blog/node.js-tips/index.html'],
    ['/blog/release-2.0', '/blog/release-2.0/index.html'],
    ['/_astro/page.Ab12Cd.css', '/_astro/page.Ab12Cd.css'],
    ['/sitemap-index.xml', '/sitemap-index.xml'],
    ['/og.png', '/og.png'],
    ['/favicon.svg', '/favicon.svg'],
    ['/rss.xml', '/rss.xml'],
    ['/404.html', '/404.html'],
  ])('%s → %s', (uri, expected) => {
    expect(handler(ev(uri)).uri).toBe(expected);
  });

  it('treats a path ending in a real file extension as a file (so slugs must not end in one; see src/lib/slugs.test.ts)', () => {
    expect(handler(ev('/blog/what-is-next.js')).uri).toBe('/blog/what-is-next.js');
  });

  it('redirects www to the apex and keeps path + query string', () => {
    const res = handler(ev('/blog/x', 'www.example.com', {
      utm_source: { value: 'linkedin' },
      tag: { value: 'a', multiValue: [{ value: 'a' }, { value: 'b' }] },
      flag: { value: '' },
    }));
    expect(res.statusCode).toBe(301);
    expect(res.headers.location.value).toBe('https://example.com/blog/x?utm_source=linkedin&tag=a&tag=b&flag');
  });

  it('passes query values through byte-for-byte (logic only; real CloudFront encoding is verified live in the cutover runbook)', () => {
    const res = handler(ev('/', 'www.example.com', { q: { value: 'a%20b' }, x: { value: '1%262' } }));
    expect(res.headers.location.value).toBe('https://example.com/?q=a%20b&x=1%262');
  });

  it('redirects www without a query string cleanly', () => {
    expect(handler(ev('/', 'www.example.com')).headers.location.value).toBe('https://example.com/');
  });
});
