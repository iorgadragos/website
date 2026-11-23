import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { SiteStack } from '../lib/site-stack';

const synth = (useCustomDomain: boolean, issueCert = false) =>
  Template.fromStack(new SiteStack(new App(), 'Test', {
    env: { account: '123456789012', region: 'us-east-1' }, useCustomDomain, issueCert,
  }));

describe('SiteStack', () => {
  it('keeps the bucket private and TLS-only', () => {
    const t = synth(false);
    t.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    });
    t.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } })]) },
    });
  });

  it('serves over HTTPS with security headers', () => {
    const t = synth(false);
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }) }),
    });
    t.resourceCountIs('AWS::CloudFront::ResponseHeadersPolicy', 1);
  });

  it('restricts the deploy role to the production environment of this exact repo (immutable subject)', () => {
    const t = synth(false);
    t.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'iorgadragos-website-github-deploy',
      AssumeRolePolicyDocument: { Statement: [Match.objectLike({
        Condition: { StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': 'repo:iorgadragos@360098670/website@1468339349:environment:production',
        } },
      })] },
    });
  });

  it('never creates or owns shared account resources (hosted zone, OIDC provider)', () => {
    for (const custom of [false, true]) {
      const t = synth(custom);
      t.resourceCountIs('AWS::Route53::HostedZone', 0);
      t.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 0);
      t.resourceCountIs('AWS::IAM::OIDCProvider', 0);
    }
  });

  it('gives the deploy role exactly the actions sync + invalidation need, on its own resources only', () => {
    const t = synth(false);
    const role = Object.values(t.findResources('AWS::IAM::Role'))[0] as any;
    expect(role.Properties.ManagedPolicyArns).toBeUndefined();
    expect(role.Properties.Policies).toBeUndefined();
    const statements = Object.values(t.findResources('AWS::IAM::Policy')).flatMap((p: any) => p.Properties.PolicyDocument.Statement);
    const allows = statements.filter((st: any) => st.Effect === 'Allow');
    const actions = allows.flatMap((st: any) => [st.Action].flat()).sort();
    expect(actions).toEqual(['cloudfront:CreateInvalidation', 's3:DeleteObject', 's3:GetObject', 's3:ListBucket', 's3:PutObject']);
    for (const st of allows) {
      const resources = JSON.stringify([st.Resource].flat());
      expect(resources).not.toMatch(/"\*"|:::\*|\*"$/);
      expect(resources).toMatch(/SiteBucket|Distribution/);
    }
    const deny = statements.find((st: any) => st.Effect === 'Deny');
    expect(deny.Action).toContain('s3:DeleteObjectVersion');
  });

  it('protects the stack and tags everything with the project', () => {
    const stack = new SiteStack(new App(), 'T', { env: { account: '123456789012', region: 'us-east-1' }, useCustomDomain: false, issueCert: false });
    expect(stack.terminationProtection).toBe(true);
    Template.fromStack(stack).hasResourceProperties('AWS::S3::Bucket', {
      Tags: Match.arrayWith([{ Key: 'project', Value: 'iorgadragos-website' }]),
    });
  });

  it('creates the certificate only in cutover modes, and no RecordSet resources', () => {
    expect(Object.keys(synth(false).findResources('AWS::CertificateManager::Certificate'))).toHaveLength(0);
    // Step A: certificate only, distribution untouched (no aliases).
    const a = synth(false, true);
    a.resourceCountIs('AWS::CertificateManager::Certificate', 1);
    a.hasResourceProperties('AWS::CloudFront::Distribution', { DistributionConfig: Match.objectLike({ Aliases: Match.absent() }) });
    // Step B: aliases attached. The cert's DNS validation is the one accepted write into the imported zone.
    const t = synth(true);
    t.resourceCountIs('AWS::CertificateManager::Certificate', 1);
    t.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainValidationOptions: Match.arrayWith([Match.objectLike({ HostedZoneId: 'Z02884203S6GFG8WANCF0' })]),
    });
    t.hasResourceProperties('AWS::CloudFront::Distribution', { DistributionConfig: Match.objectLike({ Aliases: ['iorgadragos.ro', 'www.iorgadragos.ro'] }) });
    t.resourceCountIs('AWS::Route53::RecordSet', 0); // DNS records belong to aws-foundation
  });
});
