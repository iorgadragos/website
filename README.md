# iorgadragos.ro

The website of **Dragos Iorga**, a senior tech lead delivering software end to end as an AI-augmented, one-person product team.
It is built in public with the same standards I use for client work.

| | |
|---|---|
| Site | [Astro](https://astro.build) static, MDX blog, RSS, sitemap |
| Infra | AWS CDK (TypeScript): private S3 + CloudFront (OAC), security headers, Route 53, ACM, in a dedicated AWS account |
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
The site runs in its own AWS account (**iorgadragos-studio**), in an organization managed from the private repo `iorgadragos/aws-foundation`. That repo owns everything shared: the account, its guardrails, the GitHub OIDC provider and the `iorgadragos.ro` hosted zone with its mail and apex/www records. This stack only references them. Its single write into the zone is ACM's validation CNAMEs for its own certificate.

- Owned resources are tagged `project=iorgadragos-website`, and named with that prefix where a name is set (the bucket keeps its generated name). The stack has termination protection; the bucket is versioned and retained on delete. The account ID is pinned, so deploying under the wrong profile fails.
- The deploy role can only list, get, put and delete current objects in this bucket, and invalidate this distribution. Deleting object versions is explicitly denied, so old versions are always there to roll back to.
  - The role trusts only GitHub OIDC tokens for this repo's `production` environment, which is restricted to `main`. It uses the immutable subject format, so a renamed or re-created repo can't assume it.
- `main` is protected by a ruleset: changes go through a PR, and the `site` and `infra` checks must pass.

```bash
cd infra && npm ci
npm test                                   # CDK assertion tests + CloudFront Function unit tests
AWS_PROFILE=iorgadragos npx cdk diff       # always review first
AWS_PROFILE=iorgadragos npx cdk deploy     # phase 1: CloudFront preview URL + deploy role
```
Pushes to `main` deploy the site via the repo variables `AWS_DEPLOY_ROLE_ARN`, `SITE_BUCKET` and `DISTRIBUTION_ID`, in this order:
1. Upload hashed `_astro/*` assets with a 1-year immutable cache.
2. Upload everything else with a 5-minute cache.
3. Invalidate CloudFront.
4. Prune files that were removed from the build. Old hashed assets are kept, so cached pages keep working.

**Rollback:** revert the commit on `main`, which redeploys. Previous object versions also stay in the bucket for 30 days.

### Cutover (launch week, phase 2)
`iorgadragos.ro` is currently served by a legacy CloudFront distribution in the management account. Its ID and access path are in the studio's `docs/ops/aws.md`. Touching it needs Dragos's OK and the `iorgadragos-org` profile. A CloudFront alias can only belong to one distribution at a time.

**0. Pre-flight**
- `dig +short NS iorgadragos.ro` must return **only** the studio zone's name servers (listed in `aws.md`).
- The registrar must have no DS (DNSSEC) record for the domain.
- `npm run build && npm run check:launch` passes: every `LINKS`/`LEGAL` value in `src/consts.ts` is filled, and the build has no placeholders or unservable files. CI runs the build half (`check:dist`) on every PR.

**A. Certificate (days before, no downtime)**
- In a PR, set `"issueCert": true` in `infra/cdk.json`. Merge, then run `AWS_PROFILE=iorgadragos npx cdk deploy`.
- Wait for the certificate to show *Issued*. The distribution is unchanged.

**B. Launch window (quiet hour; only the alias move is inside it, about 5–15 minutes)**
1. In a PR, set `"useCustomDomain": true` in `infra/cdk.json`, and set `dns.siteTarget` in aws-foundation to this stack's `DistributionDomain` output. Get both reviewed, and merge them at the start of the window.
2. Remove the `iorgadragos.ro` and `www` aliases from the legacy distribution. Wait until it shows *Deployed*.
3. Here, run `AWS_PROFILE=iorgadragos npx cdk deploy`, which attaches the aliases. Then in aws-foundation, run `AWS_PROFILE=iorgadragos npx cdk deploy Dns`.
4. Verify:
   - https://iorgadragos.ro returns 200 with the security headers and the new certificate.
   - https://www.iorgadragos.ro/?a=1 returns 301 to `https://iorgadragos.ro/?a=1`.
   - https://www.iorgadragos.ro/?q=a%20b&x=1%262 returns 301 with the query string byte-identical.
   - Mail still works.

**Rollback (any point in B):**
1. Run `AWS_PROFILE=iorgadragos npx cdk deploy -c useCustomDomain=false`, which frees the aliases immediately. Revert the PR afterwards.
2. Re-add the aliases and the legacy certificate to the legacy distribution.
3. Revert `dns.siteTarget` and deploy `Dns`.

**After a week without issues:** decommission the legacy distribution, bucket and certificate, as a separate, reviewed change.

## License
Code is MIT-licensed. Content (text and images) © Iorga M Dragos PFA, all rights reserved.
