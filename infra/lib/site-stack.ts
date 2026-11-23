import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { config } from './config';

export interface SiteStackProps extends StackProps {
  /**
   * Phase 2 (launch cutover): ACM cert + apex/www aliases on the distribution. The DNS records are flipped
   * in aws-foundation (`dns.siteTarget`). Requires the aliases to be removed from the legacy distribution first.
   */
  useCustomDomain: boolean;
}

/**
 * Static site: private S3 bucket + CloudFront (OAC), security headers, URL rewrite,
 * an ACM certificate validated in the studio hosted zone, and a least-privilege GitHub OIDC deploy role.
 * Deployed in us-east-1 so the CloudFront certificate can live in the same stack.
 *
 * Runs in the iorgadragos-studio account. The hosted zone (incl. apex/www alias records) and the GitHub
 * OIDC provider belong to iorgadragos/aws-foundation and are imported here, never created or changed.
 * Every owned resource is named/tagged with `config.project`.
 */
export class SiteStack extends Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);
    const { domain, project } = config;

    // --- DNS (shared zone, imported) -------------------------------------------
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: config.hostedZoneId,
      zoneName: domain,
    });

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
      functionName: `${project}-rewrite`,
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
      responseHeadersPolicyName: `${project}-security-headers`,
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
      comment: `${project} (${domain})`,
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

    // Apex/www alias records live in aws-foundation (dns.siteTarget); flip them to DistributionDomain at cutover.

    // --- GitHub Actions OIDC deploy role -----------------------------------------
    // The OIDC provider is an account-wide singleton shared with other projects: import only.
    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this, 'GithubOidc', `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`);

    const { github } = config;
    const deployRole = new iam.Role(this, 'GithubDeployRole', {
      roleName: `${project}-github-deploy`,
      description: `GitHub Actions (${github.org}/${github.repo}, environment ${github.environment}): sync site content + invalidate CDN`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `${github.subjectPrefix}:environment:${github.environment}`,
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
    new CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName });
    new CfnOutput(this, 'DistributionUrl', { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
  }
}
