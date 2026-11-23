# iorgadragos.ro

The website of **Dragos Iorga**, a senior tech lead delivering software end to end as an AI-augmented, one-person product team.
It is built in public with the same standards I use for client work.

| | |
|---|---|
| Site | [Astro](https://astro.build) static, MDX blog, RSS, sitemap |
| Infra | AWS CDK (TypeScript): private S3 + CloudFront (OAC), security headers, Route 53, ACM, in a shared AWS account |
| CI/CD | GitHub Actions: tests, type-check, build and audit on every PR; deploy via OIDC (no long-lived keys) |

## Develop
```bash
npm ci
npm run dev        # http://localhost:4321
npm test           # unit tests (vitest)
npm run build      # astro check + static build → dist/
```
Blog posts live in `src/content/blog/*.md(x)`. Set `draft: false` to publish; future-dated posts stay hidden.

## Infrastructure
The AWS account is **shared with other projects**, so the stack follows strict rules:
- It **imports, never creates or changes**, the shared resources: the Route 53 hosted zone and the GitHub OIDC provider.
- Every resource it owns is tagged `project=iorgadragos-website` (and named with that prefix where AWS allows).
- The only record it owns in the zone is `_dmarc`. Mail records (MX, SPF, verification TXT) pre-date the stack and stay outside it.
- The stack has termination protection. The bucket is retained on delete.
- The deploy role can only sync this bucket and invalidate this distribution. It trusts only GitHub OIDC tokens for this repo's `production` environment, which is restricted to `main`. It uses the immutable subject format, so a renamed or re-created repo can't assume it.

```bash
cd infra && npm ci
npm test                 # CDK assertion tests (incl. "never owns shared resources")
npx cdk diff             # always review first
npx cdk deploy           # phase 1: CloudFront preview URL + deploy role
```
Use the AWS profile named in the workspace `CLAUDE.md`. Pushes to `main` deploy the site via the repo variables `AWS_DEPLOY_ROLE_ARN`, `SITE_BUCKET` and `DISTRIBUTION_ID`.

### Cutover (launch week, phase 2)
`iorgadragos.ro` is currently served by a legacy distribution. A CloudFront alias can only belong to one distribution at a time, so:
1. Pick a quiet hour. Expect roughly 5–15 minutes of downtime on the apex and www.
2. Remove the `iorgadragos.ro` and `www` aliases from the legacy distribution, then wait until it shows *Deployed*.
3. Run `npx cdk deploy -c useCustomDomain=true`. This creates the ACM certificate (DNS-validated in the existing zone), attaches the aliases and takes over the apex/www A/AAAA records (`deleteExisting`).
4. Verify https://iorgadragos.ro, https://www.iorgadragos.ro → 301, the headers and the certificate. Then set `useCustomDomain: true` in `cdk.json` and commit.
5. After a week without issues, decommission the legacy distribution, bucket and certificate. Do this as a separate, reviewed change.

## License
Code is MIT-licensed. Content (text and images) © Iorga M Dragos PFA, all rights reserved.
