# Testing the website

| Layer | Command | Runs in | What it proves |
|---|---|---|---|
| Unit | `npm test` (vitest) | CI `site` | `src/` helpers, `edge/rewrite.js` (the CloudFront Function), `edge/security-headers.json` |
| Build checks | `npm run build && npm run check:dist` | CI `site` | `astro check`, the built output's own checks |
| End-to-end | `npm run build && npm run test:e2e` (Playwright) | CI `e2e` | every page (sitemap + built blog posts) in desktop Chromium, desktop WebKit, Pixel 7 and iPhone 14 emulation: 200, one h1, a title, no console errors or failed requests, no horizontal scroll; internal links resolve; main nav works; skip link; 404 page with status 404; robots, sitemap and RSS |
| Accessibility | part of `test:e2e` (axe-core) | CI `e2e` | no **serious or critical** WCAG 2.1 A/AA violations on any page |
| Performance, SEO | `npm run build && npm run lighthouse` (Lighthouse CI) | CI `lighthouse` | performance, accessibility, best practices and SEO ≥ 0.95 on 6 key pages, mobile and desktop presets (3 runs each) |
| Live smoke | `LIVE_URL=https://… npm run test:live` | deploy `smoke` | on the real edge: every security header at its `edge/security-headers.json` value, the pretty-URL rewrite, 404 status, cache headers |
| Exploratory | `exploratory-checklist.md` | before launch and major UI changes | what automation can't judge (copy, layout, flows), done with Claude in Chrome |

Notes:

- The e2e tests serve `dist/` with `astro preview --ignore-lock` on port 4329, so a dev server on 4321 is never reused.
- WebKit, like Safari by default, moves Tab focus only between form controls: the keyboard test uses Option+Tab there.
- Lighthouse CI runs through a pinned `npx @lhci/cli@0.16.0`, not a devDependency, to keep its transitive proxy/ftp
  dependencies (flagged by `npm audit`) out of the lockfile.
- Locally, Lighthouse needs Chrome: `CHROME_PATH` can point at Playwright's "Google Chrome for Testing".
