import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Post-deploy smoke test against the LIVE site (deploy workflow: LIVE_URL=https://<distribution domain>).
// Checks what only the real edge can show: the security headers from edge/security-headers.json, the CloudFront
// Function's pretty-URL rewrite, the 404 mapping, and cache headers. Skipped unless LIVE_URL is set.
const LIVE = process.env.LIVE_URL;
const H = JSON.parse(readFileSync('edge/security-headers.json', 'utf8'));
test.skip(!LIVE, 'LIVE_URL not set (post-deploy smoke test only)');

test('home: 200 with every security header at its configured value', async ({ request }) => {
  const r = await request.get('/');
  expect(r.status()).toBe(200);
  const h = r.headers();
  const hsts = `max-age=${H.strictTransportSecurity.maxAgeSeconds}; includeSubDomains${H.strictTransportSecurity.preload ? '; preload' : ''}`;
  expect(h['strict-transport-security']).toBe(hsts);
  expect(h['content-security-policy']).toBe(H.contentSecurityPolicy);
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe(H.frameOptions);
  expect(h['referrer-policy']).toBe(H.referrerPolicy);
  for (const [name, value] of Object.entries(H.customHeaders as Record<string, string>)) expect(h[name.toLowerCase()]).toBe(value);
});

test('pretty URL without a trailing slash is rewritten (CloudFront Function)', async ({ request }) => {
  const r = await request.get('/about');
  expect(r.status()).toBe(200);
  expect(await r.text()).toContain('<h1');
});

test('unknown path: 404 status with the site 404 page', async ({ request }) => {
  const r = await request.get('/definitely-not-a-page-' + Date.now());
  expect(r.status()).toBe(404);
  expect(await r.text()).toContain('<h1');
});

test('HTML is short-lived; fingerprinted assets (if any) are immutable', async ({ request, page }) => {
  const html = await request.get('/');
  expect(html.headers()['cache-control']).toBe('public,max-age=300');
  await page.goto('/');
  // The build currently inlines its CSS, so there may be no /_astro/ asset; check the first one when there is.
  const assets = await page.locator('link[href^="/_astro/"], script[src^="/_astro/"]').evaluateAll((els) =>
    els.map((el) => (el as HTMLLinkElement).href || (el as HTMLScriptElement).src));
  test.info().annotations.push({ type: 'assets', description: `${assets.length} fingerprinted asset(s)` });
  if (assets.length > 0) expect((await request.get(assets[0])).headers()['cache-control']).toBe('public,max-age=31536000,immutable');
});
