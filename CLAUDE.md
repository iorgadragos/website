# website: iorgadragos.ro

A public repo and a portfolio piece, so keep it exemplary. Follow the workspace rules in `../../CLAUDE.md`.

- Copy and positioning come from `../hq/docs/strategy/positioning.md` and `../hq/content/`. Don't invent claims or prices; they come from `../hq/docs/strategy/offers-and-pricing.md`.
- Never mention the current client or its industry.
- Before committing: `npm test && npm run build`; for infra changes, `cd infra && npm test && npx cdk diff`.
- No cookies and no third-party scripts unless an ADR says so. The CSP lives in `infra/lib/site-stack.ts`.
- Links to accounts that don't exist yet are marked `TODO` in `src/consts.ts`.
