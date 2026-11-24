# Testing the website

| Layer | Command | Runs in | What it proves |
|---|---|---|---|
| Unit | `npm test` (vitest) | CI `site` | `src/` helpers, `edge/rewrite.js` (the CloudFront Function), `edge/security-headers.json` |
| Build checks | `npm run build && npm run check:dist` | CI `site` | `astro check`, the built output's own checks |
| End-to-end | `npm run build && npm run test:e2e` (Playwright) | CI `e2e` | every page (sitemap + built blog posts; the 9 core pages must exist) in desktop Chromium, desktop WebKit, Pixel 7 and iPhone 14 emulation, **served with the production security headers incl. the CSP**: 200, one h1, a title, no console or CSP errors, no failed or 4xx/5xx requests, no horizontal scroll; the main nav (visible, navigates, `aria-current`); skip link. Once (desktop Chromium): every same-origin link and resource resolves; the preview server's 404; robots, sitemap and RSS |
| Accessibility | part of `test:e2e` (axe-core) | CI `e2e` | no **serious or critical** WCAG 2.2 A/AA violations on any page, in **light and dark** mode |
| Performance, SEO | `npm run build && npm run lighthouse` (Lighthouse CI) | CI `lighthouse-mobile`, `lighthouse-desktop` (parallel) | performance, accessibility, best practices and SEO ≥ 0.95 on all 9 core pages, the **median** of 3 runs, mobile and desktop presets |
| Live smoke | `LIVE_URL=https://… npm run test:live -- --project=desktop-chromium` | deploy `smoke` | on the real edge: every page loads in a browser under the live CSP with no errors, every security header at its `edge/security-headers.json` value (also on the 404), the pretty-URL rewrite returns the page, CloudFront's 403/404 → `/404.html` with status 404, cache headers |
| Exploratory | `exploratory-checklist.md` | before launch and major UI changes | what automation can't judge (copy, layout, flows), done with Claude in Chrome |

Notes:

- The e2e tests serve `dist/` with `astro preview --ignore-lock` on port 4329 (never an already-running server), and add
  the production response headers via request routing. The **production 404** (CloudFront maps 403/404 to `/404.html`)
  is proven only by the live smoke test; the e2e 404 test proves the preview server's behaviour.
- WebKit, like Safari by default, moves Tab focus only between form controls: the keyboard test uses Option+Tab there.
- CI runs e2e with `--fail-on-flaky-tests`: a test that passes only on retry fails the job.
- Lighthouse CI lives in `tools/lighthouse/`, a separate package with its own lockfile, an `overrides` pin for its
  vulnerable transitive `basic-ftp` (6.2.6), `npm audit` in CI and Dependabot. Scores use the runner's Chrome (its
  version is printed in the job), so they can drift with runner image updates.
- Locally, Lighthouse needs Chrome: `CHROME_PATH` can point at Playwright's "Google Chrome for Testing". Reports go to
  `lighthouse-reports/<preset>/` (uploaded as CI artifacts).
- Not covered yet: blog post pages (the only post is a draft, so none is built) and the deployed build being exactly
  the CI-tested one (#16, #17); the smoke test proving the new version is live (#18).
- **Pinned overrides, to revisit** (Dependabot doesn't move them): `package.json` pins `axe-core` 4.14.0 (remove once
  `@axe-core/playwright`'s own axe-core is at least 2 weeks old) and `playwright-core` 1.65.0 (must equal
  `@playwright/test`'s version; Dependabot's single `all` group bumps both together). `tools/lighthouse` pins `basic-ftp`
  6.2.6 (remove once lhci's chain resolves a patched version by itself). Its lockfile was resolved with
  `npm install --before=<date two weeks ago>` so every transitive package is at least 2 weeks old; do the same on
  manual updates.
- The CI check names `site`, `e2e`, `lighthouse-mobile` and `lighthouse-desktop` are **required** to merge (set by `scripts/github-rulesets.sh` in iorgadragos/studio). Renaming a job means updating that script in the same change.
