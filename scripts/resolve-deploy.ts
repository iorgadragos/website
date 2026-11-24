// Decides WHAT the deploy ships (iorgadragos/website#17): the `dist` artifact of a green CI run of the current main.
// The deploy never rebuilds, so the site that goes live is exactly the build CI's e2e, axe and Lighthouse jobs tested.
//   workflow_run (CI completed): that run, if it was a successful `push` to main of this repo.
//   workflow_dispatch:           the latest successful CI push run for main's current HEAD (fails if there is none).
// Either way it ships only main's CURRENT HEAD, never an older commit (no rollback). If the triggering run is for an
// older commit (CI runs finished out of order, or an old run was re-run), it ships HEAD's green CI build instead, when
// there is one: GitHub keeps one pending run per concurrency group and a newly queued run cancels it, so the run holding
// the lock must not assume HEAD's own run will still come. If HEAD has no green run yet, its completion deploys it.
// Writes `deploy`, `run_id` and `sha` to $GITHUB_OUTPUT. Needs `gh` with GH_TOKEN (actions: read, contents: read).
// Run with Node >= 24: node scripts/resolve-deploy.ts
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const env = process.env;
const repo = env.GITHUB_REPOSITORY ?? '';
const gh = (path: string, jq: string): string =>
  execFileSync('gh', ['api', path, '--jq', jq], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const SHA = /^[0-9a-f]{40}$/;
const ID = /^[0-9]+$/;

// The latest successful CI push run of `sha` on main, or '' if there is none.
const greenRun = (sha: string) =>
  gh(
    `repos/${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&head_sha=${sha}&per_page=1`,
    '.workflow_runs[0].id // empty',
  );

function out(deploy: boolean, runId = '', sha = '') {
  const lines = `deploy=${deploy}\nrun_id=${runId}\nsha=${sha}\n`;
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, lines);
  process.stdout.write(lines);
}
function skip(why: string): never {
  console.log(`::notice::not deploying: ${why}`);
  out(false);
  process.exit(0);
}
function fail(why: string): never {
  console.error(`::error::${why}`);
  process.exit(1);
}

if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) fail(`GITHUB_REPOSITORY is not owner/name: "${repo}"`);
let runId: string;
let sha: string;
if (env.GITHUB_EVENT_NAME === 'workflow_run') {
  const { WR_ID = '', WR_SHA = '', WR_CONCLUSION, WR_EVENT, WR_BRANCH, WR_REPO, WR_PATH } = env;
  // The trigger matches workflows by NAME ("CI"): require the actual CI workflow file too.
  if (WR_PATH !== '.github/workflows/ci.yml') skip(`the triggering workflow is "${WR_PATH}", not .github/workflows/ci.yml`);
  if (WR_CONCLUSION !== 'success') skip(`CI concluded "${WR_CONCLUSION}"`);
  if (WR_EVENT !== 'push') skip(`CI ran for a "${WR_EVENT}" event, not a push`);
  if (WR_BRANCH !== 'main') skip(`CI ran on "${WR_BRANCH}", not main`);
  if (WR_REPO !== repo) skip(`CI ran in "${WR_REPO}", not ${repo}`);
  runId = WR_ID;
  sha = WR_SHA;
} else if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
  sha = gh(`repos/${repo}/commits/main`, '.sha');
  if (!SHA.test(sha)) fail(`could not read main's HEAD (got "${sha}")`);
  runId = greenRun(sha);
  if (!runId) fail(`no successful CI run for main@${sha.slice(0, 7)} yet: wait for CI (or re-run it), then dispatch again`);
} else {
  fail(`unexpected event "${env.GITHUB_EVENT_NAME}"`);
}
if (!ID.test(runId)) fail(`bad CI run id "${runId}"`);
if (!SHA.test(sha)) fail(`bad commit SHA "${sha}"`);
const head = gh(`repos/${repo}/commits/main`, '.sha');
if (!SHA.test(head)) fail(`could not read main's HEAD (got "${head}")`);
if (head !== sha) {
  const headRun = greenRun(head);
  if (!headRun) skip(`main moved on to ${head.slice(0, 7)} (this is ${sha.slice(0, 7)}) and its CI hasn't passed yet: its completion deploys it`);
  console.log(`main moved on to ${head.slice(0, 7)} (this run is for ${sha.slice(0, 7)}): shipping HEAD's green CI run ${headRun}`);
  runId = headRun;
  sha = head;
  if (!ID.test(runId)) fail(`bad CI run id "${runId}"`);
}
console.log(`deploying main@${sha.slice(0, 7)}: the dist artifact of CI run ${runId}`);
out(true, runId, sha);
