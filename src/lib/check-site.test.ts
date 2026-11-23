import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = join(__dirname, '../../scripts/check-site.ts');
const run = (dist: string, mode = 'dist') => {
  try {
    execFileSync(process.execPath, [script, mode], { env: { ...process.env, CHECK_SITE_DIST: dist }, stdio: 'pipe' });
    return { code: 0, err: '' };
  } catch (e: any) {
    return { code: e.status as number, err: String(e.stderr) };
  }
};
const fixture = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'check-site-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
};

describe('check-site dist gate', () => {
  it('passes a clean build and ignores OS junk', () => {
    expect(run(fixture({ 'index.html': 'ok', 'blog/post/index.html': 'ok', 'favicon.svg': '', '.DS_Store': '' })).code).toBe(0);
  });
  it('fails on leaked placeholders', () => {
    const r = run(fixture({ 'index.html': '<a href="https://x/TODO">' }));
    expect(r.code).toBe(1);
    expect(r.err).toContain('placeholder leaked');
  });
  it('fails on file types the CDN would not serve', () => {
    expect(run(fixture({ 'index.html': 'ok', 'talk.mp4': '' })).err).toContain('allowlist');
  });
  it('fails on page URLs that look like files', () => {
    expect(run(fixture({ 'blog/what-is-next.js/index.html': 'ok' })).err).toContain('looks like a file');
  });
  it('fails cleanly on symlinks and on a missing build', () => {
    const dir = fixture({ 'index.html': 'ok' });
    symlinkSync('/nonexistent', join(dir, 'broken.html'));
    expect(run(dir).err).toContain('symlink');
    expect(run(join(dir, 'nope')).code).toBe(1);
  });
  it('rejects bad usage with exit 2', () => {
    expect(run(fixture({}), 'bogus').code).toBe(2);
  });
});
