/**
 * Site configuration.
 *
 * The AWS account is SHARED with other projects. This stack must only create resources it owns
 * (prefixed/tagged `iorgadragos-website`) and must reference, never modify, shared ones:
 * - the Route 53 hosted zone for the domain (pre-existing; mail records stay unmanaged here),
 * - the GitHub Actions OIDC provider (account-wide singleton).
 */
export const config = {
  project: 'iorgadragos-website',
  domain: 'iorgadragos.ro',
  /** Pre-existing public hosted zone (registrar NS already point to it). Not a secret. */
  hostedZoneId: 'Z3I34ZUV1084AT',
  github: {
    org: 'iorgadragos',
    repo: 'website',
    /**
     * The repo uses GitHub's immutable OIDC subject format (`repo:<org>@<org-id>/<repo>@<repo-id>`),
     * which survives renames and prevents re-created-repo squatting. Check with:
     * `gh api repos/iorgadragos/website/actions/oidc/customization/sub`.
     */
    subjectPrefix: 'repo:iorgadragos@360098670/website@1468339349',
    /** The deploy job runs in this GitHub environment, restricted to the `main` branch. */
    environment: 'production',
  },
  /**
   * DMARC is the only mail record this stack owns (it did not exist before).
   * MX / SPF / site-verification TXT pre-date this stack and stay managed outside IaC.
   */
  dmarc: 'v=DMARC1; p=none; adkim=s; aspf=s',
} as const;
