import { App, Tags } from 'aws-cdk-lib';
import { config } from '../lib/config';
import { SiteStack } from '../lib/site-stack';

const app = new App();
const bool = (key: string) => String(app.node.tryGetContext(key)) === 'true';

new SiteStack(app, 'IorgadragosWebsite', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  useCustomDomain: bool('useCustomDomain'),
  terminationProtection: true,
  description: 'iorgadragos.ro static website (S3 + CloudFront + Route 53) and GitHub OIDC deploy role',
});

// Same tag key as the other projects in the shared account (`project`), so costs split per project.
Tags.of(app).add('project', config.project);
Tags.of(app).add('repo', `${config.github.org}/${config.github.repo}`);
Tags.of(app).add('managed-by', 'cdk');
