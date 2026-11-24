import { test, expect } from '@playwright/test';
import { sitePages, securityHeaders } from './pages';

// Post-deploy smoke test against the LIVE site (deploy job `smoke`: LIVE_URL = repo variable SITE_URL).
// What only the real edge can show: the CloudFront response-headers policy (every page, incl. the 404), every page
// loading in a browser under the real CSP with no errors, the CloudFront Function's pretty-URL rewrite, the
// 403/404 → /404.html mapping, and cache headers. Locally it is skipped unless LIVE_URL is set; in CI it FAILS without it.
const LIVE = process.env.LIVE_URL;
if (!LIVE && process.env.CI) throw new Error('LIVE_URL is required in CI (repo variable SITE_URL)');
test.skip(!LIVE, 'LIVE_URL not set (post-deploy smoke test only)');
const HEADERS = securityHeaders();
const PAGES = sitePages();

function expectSecurityHeaders(h: Record<string, string>, where: string) {
  for (const [name, value] of Object.entries(HEADERS)) expect(h[name], `${name} on ${where}`).toBe(value);
  expect(h['x-xss-protection'], `x-xss-protection on ${where} (not set by design)`).toBeUndefined();
}

test('every page loads in the browser under the live CSP: 200, security headers, no console/CSP errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`failed: ${r.url()} ${r.failure()?.errorText}`));
  for (const path of PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    expectSecurityHeaders(res!.headers(), path);
    await page.waitForLoadState('networkidle');
  }
  expect(problems).toEqual([]);
});

test('pretty URL without a trailing slash is rewritten to the page (CloudFront Function)', async ({ request }) => {
  const [rewritten, canonical] = [await request.get('/about'), await request.get('/about/')];
  expect(rewritten.status()).toBe(200);
  expect(await rewritten.text()).toBe(await canonical.text());
});

test('unknown path: status 404, the site 404 page, and the security headers', async ({ request }) => {
  const r = await request.get('/definitely-not-a-page-' + Date.now());
  expect(r.status()).toBe(404);
  expect(await r.text()).toContain('404');
  expectSecurityHeaders(r.headers(), 'the 404 page');
});

test('cache headers: HTML and other files short-lived; fingerprinted assets (if any) immutable', async ({ request, page }) => {
  expect((await request.get('/')).headers()['cache-control']).toBe('public,max-age=300');
  expect((await request.get('/favicon.svg')).headers()['cache-control']).toBe('public,max-age=300');
  await page.goto('/');
  // The build currently inlines its CSS, so there is usually no /_astro/ asset: the immutable check is then vacuous.
  const assets = await page.locator('link[href^="/_astro/"], script[src^="/_astro/"]').evaluateAll((els) =>
    els.map((el) => (el as HTMLLinkElement).href || (el as HTMLScriptElement).src));
  test.info().annotations.push({ type: 'fingerprinted assets', description: String(assets.length) });
  if (assets.length > 0) expect((await request.get(assets[0])).headers()['cache-control']).toBe('public,max-age=31536000,immutable');
});
