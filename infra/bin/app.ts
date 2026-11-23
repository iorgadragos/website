import { App, Tags } from 'aws-cdk-lib';
import { SiteStack } from '../lib/site-stack';

const app = new App();
const bool = (key: string) => String(app.node.tryGetContext(key)) === 'true';

new SiteStack(app, 'IorgadragosWebsite', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  useCustomDomain: bool('useCustomDomain'),
  createOidcProvider: bool('createOidcProvider'),
  description: 'iorgadragos.ro static website (S3 + CloudFront + Route 53) and GitHub OIDC deploy role',
});

Tags.of(app).add('project', 'website');
Tags.of(app).add('owner', 'iorgadragos');
