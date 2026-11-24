import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { sitePages } from './pages';

const PAGES = sitePages();

for (const path of PAGES) {
  test.describe(`page ${path}`, () => {
    test('renders: 200, one h1, a title, no console errors, no failed requests', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(e.message));
      const failed: string[] = [];
      page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page).toHaveTitle(/\S/);
      await expect(page.locator('main#main')).toBeVisible();
      expect(errors, 'console errors').toEqual([]);
      expect(failed, 'failed requests').toEqual([]);
    });

    test('no horizontal scroll (mobile layout)', async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('accessibility: no serious or critical axe violations', async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`)).toEqual([]);
    });
  });
}

test('every internal link on every page resolves (no 404s)', async ({ page, request }) => {
  const links = new Set<string>();
  for (const path of PAGES) {
    await page.goto(path);
    for (const href of await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))) {
      links.add(href.split('#')[0]);
    }
  }
  const broken: string[] = [];
  for (const href of links) {
    if (!href) continue;
    const r = await request.get(href);
    if (r.status() >= 400) broken.push(`${href} → ${r.status()}`);
  }
  expect(broken).toEqual([]);
});

test('main navigation reaches every nav target and marks it current', async ({ page, isMobile }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const hrefs = await nav.locator('a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
  expect(hrefs.length).toBeGreaterThan(3);
  for (const href of hrefs) {
    await page.goto('/');
    const link = page.getByRole('navigation', { name: 'Main' }).locator(`a[href="${href}"]`).first();
    if (isMobile && !(await link.isVisible())) {
      // A collapsed mobile menu would be opened here; today the nav is always visible.
      test.fail(true, `nav link ${href} is not visible on mobile`);
    }
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href.replace(/[/]/g, '\\/')}$`));
    await expect(page.locator('h1')).toBeVisible();
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

test('unknown URL: 404 page with status 404 and a way home', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist/');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('a[href="/"]').first()).toBeVisible();
});

test('robots.txt, sitemap and RSS are served', async ({ request }) => {
  for (const p of ['/robots.txt', '/sitemap-index.xml', '/rss.xml']) {
    const r = await request.get(p);
    expect(r.status(), p).toBe(200);
  }
});
