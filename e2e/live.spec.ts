import { test, expect } from '@playwright/test';
import { sitePages, securityHeaders } from './pages';

// Post-deploy smoke test against the LIVE site (deploy job `smoke`: LIVE_URL = repo variable SITE_URL).
// What only the real edge can show: the CloudFront response-headers policy (every page, incl. the 404), every page
// loading in a browser under the real CSP with no errors, the CloudFront Function's pretty-URL rewrite, the
// 403/404 → /404.html mapping, and cache headers. Locally it is skipped unless LIVE_URL is set; in CI it FAILS without it.
const LIVE = process.env.LIVE_URL;
// EXPECTED_SHA: the commit just deployed. The first test waits until the edge serves it, so nothing below can pass
// against the previous version (#18). Serial mode: if it never arrives, the rest are skipped and the run fails.
const EXPECTED_SHA = process.env.EXPECTED_SHA;
if (!LIVE && process.env.CI) throw new Error('LIVE_URL is required in CI (repo variable SITE_URL)');
if (LIVE && process.env.CI && !EXPECTED_SHA) throw new Error('EXPECTED_SHA is required in CI (the deployed commit)');
test.skip(!LIVE, 'LIVE_URL not set (post-deploy smoke test only)');
// retries: 0 so the marker's wait is the whole budget (a CI retry would repeat the 6-minute wait and pass a slow edge as flaky).
test.describe.configure({ mode: 'serial', retries: 0 });
const HEADERS = securityHeaders();
const PAGES = sitePages();

function expectSecurityHeaders(h: Record<string, string>, where: string) {
  for (const [name, value] of Object.entries(HEADERS)) expect(h[name], `${name} on ${where}`).toBe(value);
  expect(h['x-xss-protection'], `x-xss-protection on ${where} (not set by design)`).toBeUndefined();
}

test('the live site serves the deployed commit (/version.txt)', async ({ request }) => {
  test.skip(!EXPECTED_SHA, 'EXPECTED_SHA not set: smoke-testing whatever version is live');
  test.setTimeout(7 * 60_000);
  // Deliberately through the edge cache (no cache-busting: the cache policy ignores query strings anyway), so this
  // proves what visitors get. The deploy invalidated /*; at worst max-age=300 expires. Network errors are values, not
  // throws: one ECONNRESET must not end the wait.
  const marker = async () => {
    try {
      const r = await request.get('/version.txt');
      return `${r.status()} ${(await r.text()).trim().slice(0, 60)}`;
    } catch (e) {
      return `error: ${(e as Error).message.split('\n')[0]}`;
    }
  };
  await expect
    .poll(marker, { message: `the live site should serve ${EXPECTED_SHA}`, timeout: 6 * 60_000, intervals: [5_000, 10_000, 15_000] })
    .toBe(`200 ${EXPECTED_SHA}`);
});

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
