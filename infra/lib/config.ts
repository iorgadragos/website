/**
 * Site configuration. The stack runs in the iorgadragos-studio AWS account (profile `iorgadragos`).
 * Shared resources are owned by iorgadragos/aws-foundation and only referenced here:
 * - the iorgadragos.ro hosted zone (mail records, apex/www alias records),
 * - the account's GitHub Actions OIDC provider.
 */
export const config = {
  project: 'iorgadragos-website',
  domain: 'iorgadragos.ro',
  /** Hosted zone owned by aws-foundation (`Dns` stack). Not a secret. */
  hostedZoneId: 'Z02884203S6GFG8WANCF0',
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
} as const;
