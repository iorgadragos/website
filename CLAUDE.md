# website: iorgadragos.ro

A public repo and a portfolio piece, so keep it exemplary. Follow the workspace rules in `../../CLAUDE.md`.

- Copy and positioning come from `../hq/docs/strategy/positioning.md` and `../hq/content/`. Don't invent claims or prices; they come from `../hq/docs/strategy/offers-and-pricing.md`.
- Never mention the current client or its industry.
- Before committing: `npm test && npm run build && npm run check:dist`. Infra changes: none here (see below).
- No cookies and no third-party scripts unless an ADR says so. The CSP lives in `edge/security-headers.json`, and the CloudFront Function in `edge/rewrite.js` (both tested). **Editing them deploys nothing:** an edge or CSP change needs a ticket in the studio ops repo. It ships via its infra script, and until the CloudFormation stacks are retired it's *blocked by #53*.
- **Never use CDK** (ADR 0011). There is no `infra/` here; infrastructure is AWS CLI scripts plus a runbook in the studio ops repo.
- Links to accounts that don't exist yet are marked `TODO` in `src/consts.ts`.
