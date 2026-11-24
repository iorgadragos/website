// The build marker served at /version.txt: the commit the site was built from (BUILD_SHA, set by CI and the deploy),
// or "dev" for local builds. The post-deploy smoke test polls it to prove the new version is live (#18).
// The repo is public, so the commit SHA is not sensitive.
export function buildMarker(sha: string | undefined = process.env.BUILD_SHA): string {
  if (sha === undefined || sha === '') return 'dev';
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`BUILD_SHA must be a full 40-char lowercase commit SHA, got "${sha}"`);
  return sha;
}
