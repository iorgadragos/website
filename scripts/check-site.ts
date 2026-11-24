// Site gates. Run with Node >= 24 (native TypeScript type stripping), from any directory.
//   node scripts/check-site.ts dist     → CI: built output has no placeholders, no unservable files, no file-like page URLs
//   node scripts/check-site.ts launch   → cutover pre-flight: the `dist` checks + every LINKS/LEGAL value is filled
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL, LINKS, isSet } from '../src/consts.ts';
import { checkMarker } from '../src/lib/build-marker.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// CHECK_SITE_DIST overrides the build dir for the script's own tests only; ignored in CI so the gate always checks dist/.
const dist = (!process.env.CI && process.env.CHECK_SITE_DIST) || join(root, 'dist');
const mode = process.argv[2];
if (mode !== 'dist' && mode !== 'launch') {
  console.error('usage: node scripts/check-site.ts <dist|launch>');
  process.exit(2);
}

// Single source of truth for "served as a file": the regex inside the CloudFront Function.
const fnSource = readFileSync(join(root, 'edge/rewrite.js'), 'utf8');
const m = fnSource.match(/var FILE_EXT = \/(.+)\/(\w*);/);
if (!m) throw new Error('FILE_EXT not found in edge/rewrite.js');
const FILE_EXT = new RegExp(m[1], m[2]);

const errors: string[] = [];
// Only these exact OS junk files are skipped; deploy.yml also excludes them from upload. Any other dotfile
// (.env, .git/…, ._*) would be uploaded by `s3 sync`, so it fails.
const OS_JUNK = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const walk = (dir: string): string[] =>
  readdirSync(dir).filter((n) => !(OS_JUNK.has(n) && lstatSync(join(dir, n)).isFile())).flatMap((name) => {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (name.startsWith('.') && !(name === '.well-known' && relative(dist, dir) === '')) {
      errors.push(`dotfile in build output (would be published): /${relative(dist, p)}`);
      return [];
    }
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

// The build marker (#18): rules in src/lib/build-marker.ts (unit-tested there).
if (existsSync(dist)) {
  const vf = join(dist, 'version.txt');
  const content = existsSync(vf) && lstatSync(vf).isFile() ? readFileSync(vf, 'utf8') : null;
  errors.push(...checkMarker(content, process.env.BUILD_SHA, Boolean(process.env.CI)));
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
console.log(`✓ ${mode} checks passed (${relative(root, dist) || '.'})`);
