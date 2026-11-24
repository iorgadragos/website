import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sitePages, securityHeaders } from './pages';

const PAGES = sitePages();
const HEADERS = securityHeaders();
// WCAG 2.2 AA (studio engineering standards), which includes the 2.0/2.1 A/AA rules.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Serve every response with the production security headers (incl. the CSP), so a CSP violation fails here too.
// astro preview sends none; on the live site they come from the CloudFront response-headers policy.
test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), ...HEADERS } });
  });
});

// Collects console errors (incl. CSP violations), page errors, network failures and HTTP >= 400 subresources.
function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url() !== page.url()) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  return problems;
}

for (const path of PAGES) {
  test.describe(`page ${path}`, () => {
    test('renders: 200, one h1, a title, no console/CSP errors, no failed or 4xx/5xx requests', async ({ page }) => {
      const problems = watch(page);
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page).toHaveTitle(/\S/);
      await expect(page.locator('main#main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(problems).toEqual([]);
    });

    test('no horizontal scroll', async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    for (const scheme of ['light', 'dark'] as const) {
      test(`accessibility (${scheme} mode): no serious or critical axe violations`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        await expect(page.locator('h1')).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`)).toEqual([]);
      });
    }
  });
}

// Site-wide checks that don't depend on the browser or the viewport: desktop Chromium only.
test.describe('site-wide', () => {
  test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'desktop-chromium', 'browser-independent: runs once'));

  test('every same-origin link and resource on every page resolves (no 4xx/5xx)', async ({ page, request }) => {
    const urls = new Set<string>();
    for (const path of PAGES) {
      await page.goto(path);
      const refs = await page.locator('a[href], link[href], img[src], script[src]').evaluateAll((els) =>
        els.map((e) => e.getAttribute('href') ?? e.getAttribute('src') ?? ''));
      for (const ref of refs) {
        if (!ref || ref.startsWith('mailto:') || ref.startsWith('tel:') || ref.startsWith('#')) continue;
        const u = new URL(ref, page.url());
        if (u.origin === new URL(page.url()).origin) urls.add(u.pathname + u.search);
      }
    }
    expect(urls.size).toBeGreaterThan(PAGES.length);
    const broken: string[] = [];
    for (const u of urls) {
      const r = await request.get(u);
      if (r.status() >= 400) broken.push(`${u} → ${r.status()}`);
    }
    expect(broken).toEqual([]);
  });

  test('unknown URL: the 404 page with status 404 and a way home (preview server; production 404 is in live.spec)', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist/');
    expect(res?.status()).toBe(404);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
  });

  test('robots.txt, sitemap and RSS are served', async ({ request }) => {
    for (const p of ['/robots.txt', '/sitemap-index.xml', '/rss.xml']) expect((await request.get(p)).status(), p).toBe(200);
  });
});

test('main navigation: every link is visible, navigates, and is marked current', async ({ page, baseURL }) => {
  await page.goto('/');
  const hrefs = await page.getByRole('navigation', { name: 'Main' }).locator('a').evaluateAll((as) =>
    as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
  expect(hrefs.length).toBeGreaterThan(3);
  for (const href of hrefs) {
    await page.goto('/');
    const link = page.getByRole('navigation', { name: 'Main' }).locator(`a[href="${href}"]`).first();
    await expect(link, `nav link ${href} must be visible (no collapsed menu today)`).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new URL(href, baseURL).href);
    await expect(page.locator('h1')).toBeVisible();
    const current = page.getByRole('navigation', { name: 'Main' }).locator(`a[href="${href}"][aria-current="page"]`);
    if (href !== '/book/') await expect(current, `${href} marked aria-current`).toHaveCount(1);
  }
});

test('skip link moves focus to the main content', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile, 'keyboard navigation is a desktop concern');
  await page.goto('/');
  // WebKit, like Safari's default, moves Tab focus only between form controls; Option+Tab reaches links.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});
