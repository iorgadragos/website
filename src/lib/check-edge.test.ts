import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = join(__dirname, '../../scripts/check-edge.ts');
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const run = (source?: string) => {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.CI; // the override is ignored in CI by design; the tests need it
  if (source !== undefined) {
    const dir = mkdtempSync(join(tmpdir(), 'check-edge-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'rewrite.js'), source);
    env.CHECK_EDGE_FN = join(dir, 'rewrite.js');
  }
  try {
    return { code: 0, out: execFileSync(process.execPath, [script], { env, stdio: 'pipe' }).toString(), err: '' };
  } catch (e: any) {
    return { code: e.status as number, out: '', err: String(e.stderr) };
  }
};
const ok = "function handler(event) { if (event.request.headers.host.value === 'www.__DOMAIN__') {} return event.request; }";

describe('check-edge gate', () => {
  it('passes the real edge/rewrite.js', () => {
    const r = run();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/parses, \d+ bytes/);
  });
  it('passes a minimal valid function', () => expect(run(ok).code).toBe(0));
  it('fails on a syntax error', () => {
    const r = run(ok.replace('return event.request;', 'return event.request'.concat(' }}')));
    expect(r.code).toBe(1);
    expect(r.err).toContain('node --check failed');
  });
  it('fails when the __DOMAIN__ placeholder is missing', () => {
    const r = run(ok.replace('__DOMAIN__', 'example.com'));
    expect(r.code).toBe(1);
    expect(r.err).toContain('no __DOMAIN__ placeholder');
  });
  it('fails on another unrendered placeholder', () => {
    const r = run(ok.replace("return", "var x = '__OTHER__'; return"));
    expect(r.code).toBe(1);
    expect(r.err).toContain('__OTHER__');
  });
  it('fails over the 10 KB CloudFront Functions limit', () => {
    const r = run(ok + '\n// ' + 'x'.repeat(10 * 1024));
    expect(r.code).toBe(1);
    expect(r.err).toContain('CloudFront Functions allow 10240');
  });
});
