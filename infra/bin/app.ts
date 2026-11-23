import { App } from 'aws-cdk-lib';
import { config } from '../lib/config';
import { SiteStack } from '../lib/site-stack';

const app = new App();
const bool = (key: string) => String(app.node.tryGetContext(key)) === 'true';

new SiteStack(app, 'IorgadragosWebsite', {
  env: { account: config.account, region: 'us-east-1' },
  issueCert: bool('issueCert'),
  useCustomDomain: bool('useCustomDomain'),
  description: 'iorgadragos.ro static website (S3 + CloudFront, optional ACM cert) and GitHub OIDC deploy role',
});

