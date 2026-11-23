import { App } from 'aws-cdk-lib';
import { config } from '../lib/config';
import { SiteStack } from '../lib/site-stack';

// FROZEN (ADR 0011): CDK is never used to deploy. Synthesis is allowed only in CI (tests + synth check).
if (!process.env.CI) {
  throw new Error('FROZEN (ADR 0011): CDK is not used. Infra is AWS CLI scripts + RUNBOOK in the studio ops repo.');
}
const app = new App();
const bool = (key: string) => String(app.node.tryGetContext(key)) === 'true';

new SiteStack(app, 'IorgadragosWebsite', {
  env: { account: config.account, region: 'us-east-1' },
  issueCert: bool('issueCert'),
  useCustomDomain: bool('useCustomDomain'),
  description: 'iorgadragos.ro static website (S3 + CloudFront, optional ACM cert) and GitHub OIDC deploy role',
});

