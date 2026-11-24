// The build marker served at /version.txt: the commit the site was built from (BUILD_SHA, set by CI and the deploy),
// or "dev" for local builds. The post-deploy smoke test polls it to prove the new version is live (#18).
// The repo is public, so the commit SHA is not sensitive.
// Pure: the caller passes the value (no process.env default, so tests can't pick up the deploy's BUILD_SHA).
export function buildMarker(sha: string | undefined): string {
  if (sha === undefined || sha === '') return 'dev';
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`BUILD_SHA must be a full 40-char lowercase commit SHA, got "${sha}"`);
  return sha;
}

// The gate on a built dist/version.txt (scripts/check-site.ts): `content` is the file's text, or null if it is missing
// or not a file. In CI a "dev" marker means BUILD_SHA was not set, so it fails there.
export function checkMarker(content: string | null, buildSha: string | undefined, ci: boolean): string[] {
  if (content === null) return ['build marker /version.txt is missing or not a file (src/pages/version.txt.ts)'];
  if (!/^([0-9a-f]{40}|dev)\n$/.test(content)) return [`build marker /version.txt is malformed: ${JSON.stringify(content.slice(0, 60))}`];
  const v = content.trim();
  if (buildSha && v !== buildSha) return [`build marker is ${v}, but BUILD_SHA is ${buildSha}`];
  if (ci && v === 'dev') return ['build marker is "dev" in CI: BUILD_SHA must be set (ci.yml, deploy.yml)'];
  return [];
}
