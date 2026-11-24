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

// A stub `gh` on PATH: HEAD = $STUB_HEAD; the CI-runs query answers $STUB_RUN (empty = none); FAIL=1 fails every call.
// Every call is logged, so tests can assert what was (not) asked.
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'resolve-deploy-'));
  dirs.push(dir);
  writeFileSync(
    join(dir, 'gh'),
    `#!/usr/bin/env bash
echo "$*" >> "${dir}/log"
[[ \${FAIL:-0} == 1 ]] && { echo "HTTP 401" >&2; exit 1; }
case "$2" in
  repos/*/commits/main) echo "$STUB_HEAD" ;;
  repos/*/actions/workflows/ci.yml/runs*) echo "$STUB_RUN" ;;
  *) echo "unexpected $2" >&2; exit 1 ;;
esac
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
    STUB_HEAD: A,
    ...vars,
  };
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
  ])('skips %s, without any API call', (_, over) => {
    const r = run(wr(over));
    expect(r.code).toBe(0);
    expect(r.output.deploy).toBe('false');
    expect(r.log).toBe('');
  });
  it('skips an older commit when main has moved on (never rolls back)', () => {
    const r = run({ ...wr(), STUB_HEAD: B });
    expect(r.code).toBe(0);
    expect(r.output).toEqual({ deploy: 'false', run_id: '', sha: '' });
    expect(r.stdout).toContain('main moved on');
  });
  it.each([
    ['a bad run id', { WR_ID: '12;rm' }],
    ['a short SHA', { WR_SHA: 'abc1234' }],
  ])('fails on %s', (_, over) => {
    const r = run(wr(over));
    expect(r.code).toBe(1);
    expect(r.output.deploy).toBeUndefined();
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
    expect(r.log).toContain(`event=push&status=success&head_sha=${A}`);
  });
  it('fails when the HEAD has no green CI run yet', () => {
    const r = run({ GITHUB_EVENT_NAME: 'workflow_dispatch', STUB_RUN: '' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('no successful CI run');
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
