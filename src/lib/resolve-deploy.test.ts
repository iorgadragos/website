import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = join(__dirname, '../../scripts/resolve-deploy.ts');
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

// A stub `gh` on PATH that answers real JSON and applies the --jq filter with jq, so the script's filters are exercised:
// commits/main → {"sha": $STUB_HEAD (JSON value, default the A string)}; the CI-runs query → one run with id $STUB_RUN,
// or none when it's empty. FAIL=1 fails every call. Every call is logged, so tests can assert what was (not) asked.
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'resolve-deploy-'));
  dirs.push(dir);
  writeFileSync(
    join(dir, 'gh'),
    `#!/usr/bin/env bash
echo "$*" >> "${dir}/log"
[[ \${FAIL:-0} == 1 ]] && { echo "HTTP 401" >&2; exit 1; }
[[ $1 == api && $3 == --jq && $# -eq 4 ]] || { echo "unexpected args: $*" >&2; exit 1; }
case "$2" in
  repos/*/commits/main) json='{"sha": '"$STUB_HEAD_JSON"'}' ;;
  repos/*/actions/workflows/ci.yml/runs*)
    if [[ -n $STUB_RUN ]]; then json='{"workflow_runs": [{"id": '"$STUB_RUN"'}]}'; else json='{"workflow_runs": []}'; fi ;;
  *) echo "unexpected $2" >&2; exit 1 ;;
esac
jq -r "$4" <<<"$json"
`,
  );
  chmodSync(join(dir, 'gh'), 0o755);
  writeFileSync(join(dir, 'out'), '');
  return dir;
}
function run(vars: Record<string, string>) {
  const dir = setup();
  const env: NodeJS.ProcessEnv = {
    PATH: `${dir}:${process.env.PATH}`,
    GITHUB_REPOSITORY: 'iorgadragos/website',
    GITHUB_OUTPUT: join(dir, 'out'),
    ...vars,
  };
  // The stub's HEAD as a JSON value: STUB_HEAD (a string) unless STUB_HEAD_JSON gives raw JSON (e.g. null).
  env.STUB_HEAD_JSON = vars.STUB_HEAD_JSON ?? JSON.stringify(vars.STUB_HEAD ?? A);
  let code = 0;
  let stdout = '';
  let stderr = '';
  try {
    stdout = execFileSync(process.execPath, [script], { env, stdio: 'pipe' }).toString();
  } catch (e: any) {
    code = e.status;
    stdout = String(e.stdout);
    stderr = String(e.stderr);
  }
  const output = Object.fromEntries(
    readFileSync(join(dir, 'out'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('=') as [string, string]),
  );
  let log = '';
  try {
    log = readFileSync(join(dir, 'log'), 'utf8');
  } catch {}
  return { code, stdout, stderr, output, log };
}
const wr = (over: Record<string, string> = {}) => ({
  GITHUB_EVENT_NAME: 'workflow_run',
  WR_ID: '123',
  WR_SHA: A,
  WR_CONCLUSION: 'success',
  WR_EVENT: 'push',
  WR_BRANCH: 'main',
  WR_REPO: 'iorgadragos/website',
  WR_PATH: '.github/workflows/ci.yml',
  ...over,
});

describe('resolve-deploy (workflow_run)', () => {
  it('deploys a green push-to-main CI run of the current HEAD', () => {
    const r = run(wr());
    expect(r.code).toBe(0);
    expect(r.output).toEqual({ deploy: 'true', run_id: '123', sha: A });
  });
  it.each([
    ['a failed CI', { WR_CONCLUSION: 'failure' }],
    ['a cancelled CI', { WR_CONCLUSION: 'cancelled' }],
    ['a pull_request run', { WR_EVENT: 'pull_request' }],
    ['another branch', { WR_BRANCH: 'feat/x' }],
    ['a fork', { WR_REPO: 'someone/website' }],
    ['another workflow named CI', { WR_PATH: '.github/workflows/other.yml' }],
    ['a missing workflow path', { WR_PATH: '' }],
  ])('skips %s, without any API call', (_, over) => {
    const r = run(wr(over));
    expect(r.code).toBe(0);
    expect(r.output.deploy).toBe('false');
    expect(r.log).toBe('');
  });
  it('an older commit, HEAD not green yet: skips (never rolls back; HEAD\'s completion deploys it)', () => {
    const r = run({ ...wr(), STUB_HEAD: B, STUB_RUN: '' });
    expect(r.code).toBe(0);
    expect(r.output).toEqual({ deploy: 'false', run_id: '', sha: '' });
    expect(r.stdout).toContain("its CI hasn't passed yet");
    expect(r.log).toContain(`head_sha=${B}`);
  });
  it('an older commit, HEAD already green: ships HEAD\'s build (a cancelled pending run loses nothing)', () => {
    const r = run({ ...wr(), STUB_HEAD: B, STUB_RUN: '789' });
    expect(r.code).toBe(0);
    expect(r.output).toEqual({ deploy: 'true', run_id: '789', sha: B });
    expect(r.log).not.toContain(`head_sha=${A}`); // never looks for (or ships) the older commit's build
  });
  it('an older commit, HEAD\'s run id malformed: fails, never deploys', () => {
    const r = run({ ...wr(), STUB_HEAD: B, STUB_RUN: '"12;rm"' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('bad CI run id');
    expect(r.output.deploy).toBeUndefined();
  });
  it.each([
    ['a bad run id', { WR_ID: '12;rm' }],
    ['a short SHA', { WR_SHA: 'abc1234' }],
  ])('fails on %s', (_, over) => {
    const r = run(wr(over));
    expect(r.code).toBe(1);
    expect(r.output.deploy).toBeUndefined();
  });
  it.each([
    ['empty', { STUB_HEAD: '' }],
    ['null', { STUB_HEAD_JSON: 'null' }],
    ['short', { STUB_HEAD: 'abc' }],
  ])('fails (never deploys) when main\'s HEAD is %s', (_, over) => {
    const r = run({ ...wr(), ...over });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("could not read main's HEAD");
    expect(r.output.deploy).toBeUndefined();
  });
  it('asks GitHub exactly for main\'s HEAD SHA', () => {
    expect(run(wr()).log).toContain('api repos/iorgadragos/website/commits/main --jq .sha');
  });
  it('fails (never deploys) when main cannot be read', () => {
    const r = run({ ...wr(), FAIL: '1' });
    expect(r.code).not.toBe(0);
    expect(r.output.deploy).toBeUndefined();
  });
});

describe('resolve-deploy (workflow_dispatch)', () => {
  it('deploys the green CI run of the current HEAD', () => {
    const r = run({ GITHUB_EVENT_NAME: 'workflow_dispatch', STUB_RUN: '456' });
    expect(r.code).toBe(0);
    expect(r.output).toEqual({ deploy: 'true', run_id: '456', sha: A });
    expect(r.log).toContain(`branch=main&event=push&status=success&head_sha=${A}`);
    expect(r.log).toContain('--jq .workflow_runs[0].id // empty');
  });
  it('fails when the HEAD has no green CI run yet', () => {
    const r = run({ GITHUB_EVENT_NAME: 'workflow_dispatch', STUB_RUN: '' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('no successful CI run');
  });
  it.each([
    ['empty', { STUB_HEAD: '' }],
    ['null', { STUB_HEAD_JSON: 'null' }],
  ])('fails when main\'s HEAD is %s', (_, over) => {
    const r = run({ GITHUB_EVENT_NAME: 'workflow_dispatch', STUB_RUN: '456', ...over });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("could not read main's HEAD");
  });
  it('fails when the API is unreachable', () => {
    const r = run({ GITHUB_EVENT_NAME: 'workflow_dispatch', FAIL: '1' });
    expect(r.code).not.toBe(0);
    expect(r.output.deploy).toBeUndefined();
  });
});

describe('resolve-deploy (anything else)', () => {
  it.each(['push', 'pull_request', ''])('fails on event %j', (ev) => {
    expect(run({ GITHUB_EVENT_NAME: ev }).code).toBe(1);
  });
  it('fails on a malformed GITHUB_REPOSITORY', () => {
    expect(run({ ...wr(), GITHUB_REPOSITORY: 'x/y/../z' }).code).toBe(1);
  });
});
