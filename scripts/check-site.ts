// Site gates. Run with Node >= 24 (native TypeScript type stripping), from any directory.
//   node scripts/check-site.ts dist     → CI: built output has no placeholders, no unservable files, no file-like page URLs
//   node scripts/check-site.ts launch   → cutover pre-flight: the `dist` checks + every LINKS/LEGAL value is filled
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL, LINKS, isSet } from '../src/consts.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// CHECK_SITE_DIST overrides the build dir (used by the script's own tests).
const dist = process.env.CHECK_SITE_DIST ?? join(root, 'dist');
const mode = process.argv[2];
if (mode !== 'dist' && mode !== 'launch') {
  console.error('usage: node scripts/check-site.ts <dist|launch>');
  process.exit(2);
}

// Single source of truth for "served as a file": the regex inside the CloudFront Function.
const fnSource = readFileSync(join(root, 'infra/lib/edge/rewrite.js'), 'utf8');
const m = fnSource.match(/var FILE_EXT = \/(.+)\/(\w*);/);
if (!m) throw new Error('FILE_EXT not found in infra/lib/edge/rewrite.js');
const FILE_EXT = new RegExp(m[1], m[2]);

const errors: string[] = [];
// Local OS junk is never deployed meaningfully; skip it (dotfiles other than .well-known).
const ignored = (name: string) => name.startsWith('.') && name !== '.well-known';
const walk = (dir: string): string[] =>
  readdirSync(dir).filter((n) => !ignored(n)).flatMap((name) => {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) {
      errors.push(`symlink in build output (not allowed): /${relative(dist, p)}`);
      return [];
    }
    return st.isDirectory() ? [p + '/', ...walk(p)] : [p];
  });

if (!existsSync(dist)) {
  errors.push('dist/ is missing: run `npm run build` first');
} else {
  for (const p of walk(dist)) {
    const rel = relative(dist, p);
    if (p.endsWith('/')) {
      // A page directory whose name looks like a file is served as a file by the CDN → 404.
      const seg = rel.split('/').pop()!;
      if (FILE_EXT.test(seg)) errors.push(`page URL looks like a file (CDN would 404): /${rel}/`);
      continue;
    }
    if (!FILE_EXT.test(rel)) errors.push(`file type not in the CloudFront Function allowlist (would 404): /${rel} (${extname(rel) || 'no extension'})`);
    if (/\.(html|xml)$/.test(rel) && readFileSync(p, 'utf8').includes('TODO')) errors.push(`placeholder leaked into /${rel}`);
  }
}

if (mode === 'launch') {
  for (const [group, values] of Object.entries({ LINKS, LEGAL })) {
    for (const [key, value] of Object.entries(values)) {
      if (!isSet(value)) errors.push(`${group}.${key} is still a placeholder in src/consts.ts`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ ${mode} checks passed`);
