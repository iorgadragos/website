import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { config } from './config';

export interface SiteStackProps extends StackProps {
  /** Phase 2: attach the apex/www domain + ACM cert (only after NS are delegated to Route 53). */
  useCustomDomain: boolean;
  /** Create the GitHub OIDC provider (false if the account already has one). */
  createOidcProvider: boolean;
}

/**
 * Static site: private S3 bucket + CloudFront (OAC), security headers, URL rewrite,
 * Route 53 zone incl. Google Workspace mail records, and a least-privilege GitHub OIDC deploy role.
 * Deployed in us-east-1 so the CloudFront certificate can live in the same stack.
 */
export class SiteStack extends Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);
    const { domain } = config;

    // --- DNS ---------------------------------------------------------------
    const zone = new route53.PublicHostedZone(this, 'Zone', { zoneName: domain });
    zone.applyRemovalPolicy(RemovalPolicy.RETAIN);
    new route53.MxRecord(this, 'Mx', { zone, values: [...config.mx] });
    new route53.TxtRecord(this, 'RootTxt', { zone, values: [...config.txtRoot] });
    new route53.TxtRecord(this, 'Dmarc', { zone, recordName: '_dmarc', values: [config.dmarc] });
    if (config.dkim.value) {
      new route53.TxtRecord(this, 'Dkim', { zone, recordName: `${config.dkim.selector}._domainkey`, values: [config.dkim.value] });
    }

    // --- Storage -------------------------------------------------------------
    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30) }],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // --- Edge ----------------------------------------------------------------
    const rewrite = new cloudfront.Function(this, 'Rewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var req = event.request;
  var host = req.headers.host && req.headers.host.value;
  if (host === 'www.${domain}') {
    return { statusCode: 301, statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://${domain}' + req.uri } } };
  }
  var uri = req.uri;
  if (uri.endsWith('/')) { req.uri = uri + 'index.html'; }
  else if (!uri.split('/').pop().includes('.')) { req.uri = uri + '/index.html'; }
  return req;
}`),
    });

    const headers = new cloudfront.ResponseHeadersPolicy(this, 'Headers', {
      securityHeadersBehavior: {
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, preload: true, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        contentSecurityPolicy: {
          contentSecurityPolicy:
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [{ header: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()', override: true }],
      },
    });

    let certificate: acm.ICertificate | undefined;
    if (props.useCustomDomain) {
      certificate = new acm.Certificate(this, 'Cert', {
        domainName: domain,
        subjectAlternativeNames: [`www.${domain}`],
        validation: acm.CertificateValidation.fromDns(zone),
      });
    }

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: props.useCustomDomain ? cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021 : undefined,
      domainNames: props.useCustomDomain ? [domain, `www.${domain}`] : undefined,
      certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers,
        compress: true,
        functionAssociations: [{ function: rewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: Duration.minutes(5) },
      ],
    });

    if (props.useCustomDomain) {
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
      for (const name of [undefined, 'www']) {
        new route53.ARecord(this, `A${name ?? 'Apex'}`, { zone, recordName: name, target });
        new route53.AaaaRecord(this, `Aaaa${name ?? 'Apex'}`, { zone, recordName: name, target });
      }
    }

    // --- GitHub Actions OIDC deploy role -----------------------------------------
    const providerArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`;
    const provider = props.createOidcProvider
      ? new iam.OpenIdConnectProvider(this, 'GithubOidc', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
        })
      : iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GithubOidc', providerArn);

    const deployRole = new iam.Role(this, 'GithubDeployRole', {
      description: `Deploy ${config.githubOrg}/${config.githubRepo} site content`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:${config.githubOrg}/${config.githubRepo}:ref:refs/heads/${config.githubBranch}`,
        },
      }),
    });
    bucket.grantReadWrite(deployRole);
    bucket.grantDelete(deployRole);
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cloudfront:CreateInvalidation'],
      resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
    }));

    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'DistributionUrl', { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
    new CfnOutput(this, 'NameServers', { value: Stack.of(this).toJsonString(zone.hostedZoneNameServers) });
  }
}
