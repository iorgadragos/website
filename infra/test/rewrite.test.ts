import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, '../lib/edge/rewrite.js'), 'utf8').replaceAll('__DOMAIN__', 'example.com');
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
    ['/favicon.svg', '/favicon.svg'],
    ['/rss.xml', '/rss.xml'],
    ['/404.html', '/404.html'],
  ])('%s → %s', (uri, expected) => {
    expect(handler(ev(uri)).uri).toBe(expected);
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

  it('redirects www without a query string cleanly', () => {
    expect(handler(ev('/', 'www.example.com')).headers.location.value).toBe('https://example.com/');
  });
});
