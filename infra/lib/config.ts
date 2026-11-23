/**
 * Site + DNS configuration. Values marked VERIFY must be checked against the current
 * DNS zone export before the NS cutover (see studio/hq Studio Ops issue "Migrate DNS").
 */
export const config = {
  domain: 'iorgadragos.ro',
  githubOrg: 'iorgadragos',
  githubRepo: 'website',
  githubBranch: 'main',
  // Google Workspace mail records (VERIFY against the current zone; Google's current MX is smtp.google.com)
  mx: [{ priority: 1, hostName: 'smtp.google.com' }],
  txtRoot: [
    'v=spf1 include:_spf.google.com ~all',
    // 'google-site-verification=VERIFY',
  ],
  // DKIM: Google Admin → Apps → Gmail → Authenticate email → copy the TXT value (VERIFY)
  dkim: { selector: 'google', value: '' },
  dmarc: 'v=DMARC1; p=none; adkim=s; aspf=s',
} as const;
