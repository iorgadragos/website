# iorgadragos.ro

The website of **Dragos Iorga**, a senior tech lead delivering software end to end as an AI-augmented, one-person product team.
It is built in public with the same standards I use for client work.

| | |
|---|---|
| Site | [Astro](https://astro.build) static, MDX blog, RSS, sitemap |
| Infra | AWS CDK (TypeScript): private S3 + CloudFront (OAC), security headers, Route 53, ACM |
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
```bash
cd infra && npm ci
npm test                       # CDK assertion tests
npx cdk diff                   # review first
npx cdk deploy                 # phase 1: CloudFront preview URL, Route 53 zone, OIDC role
npx cdk deploy -c useCustomDomain=true   # phase 2: after NS delegation → ACM cert + apex/www records
```
- If the AWS account already has a GitHub OIDC provider, add `-c createOidcProvider=false`.
- Mail records (Google Workspace) are in `infra/lib/config.ts`. Check them against the current zone **before** switching name servers.
- After the first deploy, set repo variables `AWS_DEPLOY_ROLE_ARN`, `SITE_BUCKET` and `DISTRIBUTION_ID` from the stack outputs. Pushes to `main` then deploy automatically.

## License
Code is MIT-licensed. Content (text and images) © Iorga M Dragos PFA, all rights reserved.
