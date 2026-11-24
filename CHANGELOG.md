# Changelog

All notable changes to iorgadragos.ro. Dates are ISO (YYYY-MM-DD); the site is versioned by deploys of `main`.

## Unreleased
- CI: `npm run check:edge` renders the CloudFront Function like the infra script, runs `node --check` and enforces
  the 10 KB limit; README and CLAUDE.md now describe the retired stacks and the `03-website.sh` path (#14).
- Tests: Playwright end-to-end on every page (desktop Chromium and WebKit, Pixel 7 and iPhone 14 emulation) under
  the production CSP; axe WCAG 2.2 AA in light and dark mode; Lighthouse CI ≥ 0.95 (mobile and desktop); a
  post-deploy smoke test on the live edge (iorgadragos/studio#41).

## 2026-11-24
- CDK infrastructure removed from this repo (ADR 0011): the edge code (`edge/rewrite.js`, `edge/security-headers.json`)
  is tested data, deployed by the studio's `03-website.sh` (#10).
