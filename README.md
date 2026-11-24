# iorgadragos.ro

The website of **Dragos Iorga**, a senior tech lead delivering software end to end as an AI-augmented, one-person product team.
It is built in public with the same standards I use for client work.

| | |
|---|---|
| Site | [Astro](https://astro.build) static, MDX blog, RSS, sitemap |
| Infra | AWS CLI scripts + a verified runbook: private S3 + CloudFront (OAC), security headers, Route 53, ACM, in a dedicated AWS account |
| CI/CD | GitHub Actions: tests, type-check, build and audit on every PR; deploy via OIDC (no long-lived keys) |

## Develop
```bash
npm ci
npm run dev        # http://localhost:4321
npm test           # unit tests (vitest)
npm run build      # astro check + static build → dist/
npm run check:launch   # launch gate: placeholders filled, build servable
npx playwright install chromium webkit   # once
npm run test:e2e   # after build: Playwright on every page (desktop + mobile emulation) + axe
npm run lighthouse # after build: Lighthouse CI budgets >= 0.95 (mobile + desktop)
```
All test layers, and the exploratory checklist for launches: [`docs/testing/`](docs/testing/README.md).
Blog posts live in `src/content/blog/*.md(x)`. Set `draft: false` to publish; future-dated posts stay hidden.

## Infrastructure
The site runs on private S3 + CloudFront (OAC) with security headers and a strict CSP, in a dedicated AWS account. It deploys from `main` via GitHub Actions with OIDC (no long-lived keys); the deploy role can only sync this bucket and invalidate this distribution.

The infrastructure itself is managed **with the AWS CLI and a documented runbook** in the studio's private ops repo. No CDK, Terraform or CloudFormation templates (the old CloudFormation stacks are being retired).

`edge/` holds what runs at the edge, as reviewed and tested data that the infra scripts apply:
- `edge/rewrite.js`: the CloudFront Function (pretty URLs, www → apex 301 keeping the query string), unit-tested in `edge/rewrite.test.ts`.
- `edge/security-headers.json`: HSTS, CSP, frame/referrer/permissions policies, tested in `edge/security-headers.test.ts`.

Changing these files deploys nothing by itself: the change ships when the ops repo's script applies it (and records it in its runbook).

Pushes to `main` deploy the site via the repo variables `AWS_DEPLOY_ROLE_ARN`, `SITE_BUCKET` and `DISTRIBUTION_ID`, in this order:
1. Upload hashed `_astro/*` assets with a 1-year immutable cache.
2. Upload everything else with a 5-minute cache.
3. Invalidate CloudFront.
4. Prune files that were removed from the build. Old hashed assets are kept, so cached pages keep working.

**Rollback:** revert the commit on `main`, which redeploys. Previous object versions also stay in the bucket for 30 days.

## License
Code is MIT-licensed. Content (text and images) © Iorga M Dragos PFA, all rights reserved.
