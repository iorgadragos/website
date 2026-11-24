# iorgadragos.ro

The website of **Dragos Iorga**, a senior tech lead delivering software end to end as an AI-augmented, one-person product team.
It is built in public with the same standards I use for client work.

| | |
|---|---|
| Site | [Astro](https://astro.build) static, MDX blog, RSS, sitemap |
| Infra | AWS CLI scripts + a verified runbook: private S3 + CloudFront (OAC), security headers, Route 53, ACM, in a dedicated AWS account |
| CI/CD | GitHub Actions on every PR: unit tests, type-check, build, audit, Playwright e2e (desktop + mobile emulation, axe WCAG 2.2 AA), Lighthouse CI ≥ 0.95; deploy via OIDC (no long-lived keys) with a post-deploy smoke test |

## Develop
```bash
npm ci
npm run dev        # http://localhost:4321
npm test           # unit tests (vitest)
npm run build      # astro check + static build → dist/
npm run check:edge # the CloudFront Function as published: renders, parses, has handler(), fits 10 KB
npm run check:launch   # launch gate: placeholders filled, build servable
npx playwright install chromium webkit   # once
npm run test:e2e   # after build: Playwright on every page (desktop + mobile emulation) + axe
npm run lighthouse # after build: Lighthouse CI budgets >= 0.95 (mobile + desktop)
```
All test layers, and the exploratory checklist for launches: [`docs/testing/`](docs/testing/README.md).
Blog posts live in `src/content/blog/*.md(x)`. Set `draft: false` to publish; future-dated posts stay hidden.

## Infrastructure
The site runs on private S3 + CloudFront (OAC) with security headers and a strict CSP, in a dedicated AWS account. It deploys from `main` via GitHub Actions with OIDC (no long-lived keys); the deploy role can only sync this bucket and invalidate this distribution.

The infrastructure itself is managed **with the AWS CLI and a documented runbook** in the studio's private ops repo.
No CDK, Terraform or CloudFormation: the last of the studio's CloudFormation stacks was retired on 2026-11-24, and the
site's resources are converged by the ops repo's `03-website.sh` script from its merged `main`.

`edge/` holds what runs at the edge, as reviewed and tested data that the infra scripts apply:
- `edge/rewrite.js`: the CloudFront Function (pretty URLs, www → apex 301 keeping the query string), unit-tested in
  `edge/rewrite.test.ts`; `npm run check:edge` (in CI) renders `__DOMAIN__` like the infra script, runs `node --check`
  and enforces CloudFront's 10 KB limit.
- `edge/security-headers.json`: HSTS, CSP, frame/referrer/permissions policies, tested in `edge/security-headers.test.ts`.

Changing these files deploys nothing by itself: the change ships when the ops repo's `03-website.sh` applies it from
merged `main` (a ticket there, recorded in its runbook). The script tests a new function on CloudFront's DEVELOPMENT
stage before publishing it.

The deploy ships **exactly the build CI tested**: when CI succeeds on a push to `main`, the `Deploy site` workflow takes
that run's `dist` artifact (no rebuild), checks with `check:dist` that its `/version.txt` is this commit, and uploads it
via the repo variables `AWS_DEPLOY_ROLE_ARN`, `SITE_BUCKET`, `DISTRIBUTION_ID` and `SITE_URL`, in this order:
1. Upload hashed `_astro/*` assets with a 1-year immutable cache.
2. Upload everything else with a 5-minute cache.
3. Invalidate CloudFront.
4. Prune files that were removed from the build. Old hashed assets are kept, so cached pages keep working.

`scripts/resolve-deploy.ts` decides what to ship. It deploys only if that commit is still `main`'s HEAD, so an older
run finishing late never rolls the site back. A manual run (`workflow_dispatch`) ships the green CI run of `main`'s
current HEAD; if CI hasn't passed for it yet, or its artifact has expired (7 days), re-run CI first.

Every build writes the commit it was built from to `/version.txt` (`BUILD_SHA`; `dev` locally). Then the `smoke` job
waits (up to 6 minutes) until the live site serves this commit's `/version.txt`, and runs `e2e/live.spec.ts` against
`SITE_URL` (the distribution domain until the launch cutover, then `https://iorgadragos.ro`); it fails if `SITE_URL` is
missing. If it fails, the new version is already live: fix forward, or revert the commit on `main`. **A rollback is
gated on CI too**: the revert ships only after its CI run passes (about 8–10 minutes, both Lighthouse jobs included),
then the deploy and smoke (about 3 minutes). If CI is red for an unrelated reason (e.g. a Lighthouse score drifting
with a runner image update), fix or relax that check in the same revert PR; a break-glass deploy of an older green
build is tracked in #23. Re-running an old deploy run ships nothing: that commit is no longer `main`'s HEAD.

**Rollback:** revert the commit on `main`, which redeploys. Previous object versions also stay in the bucket for 30 days.

## License
Code is MIT-licensed. Content (text and images) © Iorga M Dragos PFA, all rights reserved.
