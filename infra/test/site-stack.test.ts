import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { SiteStack } from '../lib/site-stack';

const synth = (useCustomDomain: boolean) =>
  Template.fromStack(new SiteStack(new App(), 'Test', {
    env: { account: '123456789012', region: 'us-east-1' }, useCustomDomain,
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

  it('scopes the deploy role to its own bucket and distribution only', () => {
    const policies = synth(false).findResources('AWS::IAM::Policy');
    const json = JSON.stringify(policies);
    expect(json).not.toContain('"Resource":"*"');
    expect(json).toContain('cloudfront:CreateInvalidation');
  });

  it('only creates a certificate and alias records in custom-domain mode', () => {
    expect(Object.keys(synth(false).findResources('AWS::CertificateManager::Certificate'))).toHaveLength(0);
    const t = synth(true);
    t.resourceCountIs('AWS::CertificateManager::Certificate', 1);
    t.resourceCountIs('AWS::Route53::RecordSet', 1 /* DMARC */ + 4 /* A/AAAA apex+www */);
  });
});
