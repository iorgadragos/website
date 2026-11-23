import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { SiteStack } from '../lib/site-stack';

const synth = (useCustomDomain: boolean) =>
  Template.fromStack(new SiteStack(new App(), 'Test', {
    env: { account: '123456789012', region: 'us-east-1' }, useCustomDomain, createOidcProvider: true,
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

  it('restricts the deploy role to the main branch of the website repo', () => {
    const t = synth(false);
    t.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: { Statement: [Match.objectLike({
        Condition: Match.objectLike({ StringLike: { 'token.actions.githubusercontent.com:sub': 'repo:iorgadragos/website:ref:refs/heads/main' } }),
      })] },
    });
  });

  it('only creates a certificate and alias records in custom-domain mode', () => {
    expect(Object.keys(synth(false).findResources('AWS::CertificateManager::Certificate'))).toHaveLength(0);
    const t = synth(true);
    t.resourceCountIs('AWS::CertificateManager::Certificate', 1);
    t.resourceCountIs('AWS::Route53::RecordSet', 3 /* MX, TXT, DMARC */ + 4 /* A/AAAA apex+www */);
  });
});
