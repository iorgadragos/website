import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = join(__dirname, '../../scripts/check-site.ts');
const run = (dist: string, mode = 'dist') => {
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, CHECK_SITE_DIST: dist };
    delete env.CI; // the override is ignored in CI by design; the tests need it
    execFileSync(process.execPath, [script, mode], { env, stdio: 'pipe' });
    return { code: 0, err: '' };
  } catch (e: any) {
    return { code: e.status as number, err: String(e.stderr) };
  }
};
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const fixture = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'check-site-'));
  dirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
};

describe('check-site dist gate', () => {
  it('passes a clean build, ignores OS junk and allows /.well-known', () => {
    expect(run(fixture({
      'index.html': 'ok', 'blog/post/index.html': 'ok', 'favicon.svg': '', '.DS_Store': '', '._index.html': '',
      '.well-known/security.txt': 'Contact: x',
    })).code).toBe(0);
  });
  it('fails on any other dotfile (it would be published)', () => {
    for (const f of ['.env', '.git/config', 'blog/.secrets.json', '.backup.html']) {
      const r = run(fixture({ 'index.html': 'ok', [f]: 'SECRET=1' }));
      expect(r.code, f).toBe(1);
      expect(r.err, f).toContain('dotfile in build output');
    }
  });
  it('fails on leaked placeholders', () => {
    const r = run(fixture({ 'index.html': '<a href="https://x/TODO">' }));
    expect(r.code).toBe(1);
    expect(r.err).toContain('placeholder leaked');
  });
  it('fails on file types the CDN would not serve', () => {
    const r = run(fixture({ 'index.html': 'ok', 'talk.mp4': '' }));
    expect(r.code).toBe(1);
    expect(r.err).toContain('allowlist');
  });
  it('fails on page URLs that look like files', () => {
    const r = run(fixture({ 'blog/what-is-next.js/index.html': 'ok' }));
    expect(r.code).toBe(1);
    expect(r.err).toContain('looks like a file');
  });
  it('fails cleanly on symlinks and on a missing build', () => {
    const dir = fixture({ 'index.html': 'ok' });
    symlinkSync('/nonexistent', join(dir, 'broken.html'));
    const sym = run(dir);
    expect(sym.code).toBe(1);
    expect(sym.err).toContain('symlink');
    const missing = run(join(dir, 'nope'));
    expect(missing.code).toBe(1);
    expect(missing.err).toContain('dist/ is missing');
  });
  it('rejects bad usage with exit 2', () => {
    expect(run(fixture({}), 'bogus').code).toBe(2);
  });
});
