import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = join(__dirname, '../../scripts/check-edge.ts');
const DOMAIN = 'iorgadragos.ro'; // the script's default (= the ops repo's lib-website.sh DOMAIN)
const LIMIT = 10240;
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const write = (source: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'check-edge-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'rewrite.js'), source);
  return join(dir, 'rewrite.js');
};
// run(source?, { ci }): source undefined → the real edge/rewrite.js.
const run = (source?: string, opts: { ci?: boolean } = {}) => {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.CI;
  if (opts.ci) env.CI = 'true';
  if (source !== undefined) env.CHECK_EDGE_FN = write(source);
  try {
    return { code: 0, out: execFileSync(process.execPath, [script], { env, stdio: 'pipe' }).toString(), err: '' };
  } catch (e: any) {
    return { code: e.status as number, out: '', err: String(e.stderr) };
  }
};
const ok = "function handler(event) {\n  if (event.request.headers.host.value === 'www.__DOMAIN__') {}\n  return event.request;\n}\n";
const rendered = (s: string) => s.replaceAll('__DOMAIN__', DOMAIN);
// A source whose RENDERED size is exactly `bytes`, padded with a trailing comment of `pad` characters (then ASCII).
const sized = (bytes: number, pad = 'x', base = ok) => {
  const head = base + '// ';
  const room = bytes - Buffer.byteLength(rendered(head), 'utf8');
  const unit = Buffer.byteLength(pad, 'utf8');
  if (room < 0) throw new Error('fixture base is already over the requested size');
  return head + pad.repeat(Math.floor(room / unit)) + 'x'.repeat(room % unit); // ASCII fills any remainder
};

describe('check-edge gate', () => {
  it('passes the real edge/rewrite.js, rendered for the production domain', () => {
    const r = run();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(new RegExp(`rendered for ${DOMAIN.replace('.', '\\.')}: parses, \\d+ bytes`));
  });
  it('passes a minimal valid function', () => expect(run(ok).code).toBe(0));
  it('ignores the CHECK_EDGE_FN override in CI (always checks the real file)', () => {
    const r = run('this is not javascript {', { ci: true });
    expect(r.code).toBe(0);
    expect(r.out).toContain('rendered for');
  });
  it('fails on a syntax error', () => {
    const r = run(ok.replace('return event.request;', 'return event.request; }}'));
    expect(r.code).toBe(1);
    expect(r.err).toContain('node --check failed');
  });
  it('fails on ES module syntax (CloudFront Functions are classic scripts)', () => {
    const r = run(`${ok}export { handler };\n`);
    expect(r.code).toBe(1);
    expect(r.err).toContain('node --check failed');
  });
  it('fails without a top-level function handler(event)', () => {
    const r = run(ok.replace('function handler(event)', 'function main(event)'));
    expect(r.code).toBe(1);
    expect(r.err).toContain('function handler(event)');
  });
  it('fails when __DOMAIN__ is missing, or only in a comment', () => {
    const none = ok.replace('__DOMAIN__', 'example.com');
    expect(run(none).err).toContain('no __DOMAIN__ placeholder');
    const r = run(`// __DOMAIN__\n${none}`);
    expect(r.code).toBe(1);
    expect(r.err).toContain('no __DOMAIN__ placeholder');
  });
  it.each(['__OTHER__', '__SITE_URL__', '__DOMAIN_2__'])('fails on an unrendered placeholder %s', (p) => {
    const r = run(ok.replace('return', `var x = '${p}'; return`));
    expect(r.code).toBe(1);
    expect(r.err).toContain(`unrendered placeholder left: ${p}`);
  });
  it('passes at exactly 10240 rendered bytes and fails at 10241', () => {
    expect(run(sized(LIMIT)).code).toBe(0);
    const r = run(sized(LIMIT + 1));
    expect(r.code).toBe(1);
    expect(r.err).toContain(`${LIMIT + 1} bytes; CloudFront Functions allow ${LIMIT}`);
  });
  it('counts UTF-8 bytes, not characters', () => {
    const multi = sized(LIMIT + 1, '→'); // → is 3 bytes: fewer than 10240 characters, more than 10240 bytes
    expect(Buffer.byteLength(rendered(multi), 'utf8')).toBe(LIMIT + 1);
    expect(multi.length).toBeLessThan(LIMIT);
    expect(run(multi).code).toBe(1);
  });
  it('measures the rendered size (each __DOMAIN__ grows by 4 bytes)', () => {
    const src = sized(LIMIT + 2);
    expect(Buffer.byteLength(src, 'utf8')).toBeLessThanOrEqual(LIMIT); // under the limit before rendering
    expect(run(src).code).toBe(1);
  });
  it('fails cleanly when the source cannot be read', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, CHECK_EDGE_FN: '/nonexistent/rewrite.js' };
    delete env.CI;
    let err = '';
    let code = 0;
    try {
      execFileSync(process.execPath, [script], { env, stdio: 'pipe' });
    } catch (e: any) {
      code = e.status;
      err = String(e.stderr);
    }
    expect(code).toBe(1);
    expect(err).toContain('cannot read /nonexistent/rewrite.js');
    expect(err).not.toContain('    at '); // no stack trace
  });
});
