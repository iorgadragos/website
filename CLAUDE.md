# website: iorgadragos.ro

> **⚠ FROZEN (ADR 0011).** We don't use CDK: all infrastructure is managed with AWS CLI scripts plus `infra/RUNBOOK.md` in `iorgadragos/studio`. Until the CloudFormation stacks are retired, **don't run any `cdk` command** and don't change stack-owned resources with the CLI. Site **content** deploys (GitHub workflow: S3 sync + invalidation) continue as normal. The CDK code here is kept only until the retirement, then removed.

A public repo and a portfolio piece, so keep it exemplary. Follow the workspace rules in `../../CLAUDE.md`.

- Copy and positioning come from `../hq/docs/strategy/positioning.md` and `../hq/content/`. Don't invent claims or prices; they come from `../hq/docs/strategy/offers-and-pricing.md`.
- Never mention the current client or its industry.
- Before committing: `npm test && npm run build && npm run check:dist`. Infra changes: none here (frozen, see the banner).
- No cookies and no third-party scripts unless an ADR says so. The CSP currently lives in `infra/lib/site-stack.ts` (frozen). Where it lives after the retirement is decided later (ADR 0011).
- Links to accounts that don't exist yet are marked `TODO` in `src/consts.ts`.
