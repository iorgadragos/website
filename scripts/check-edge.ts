// Checks the CloudFront Function source as it will be published (iorgadragos/website#14). It renders edge/rewrite.js
// the way the ops repo's 03-website.sh does (__DOMAIN__ → the domain), then checks:
//   - __DOMAIN__ appears in code (not only in a comment), and no other __PLACEHOLDER__ is left;
//   - a top-level `function handler(event)`, the CloudFront entry point;
//   - `node --check` parses it as a classic script (.cjs: ES module syntax such as `export` is rejected, as CloudFront would);
//   - it fits CloudFront Functions' 10 KB (10240-byte) code limit, measured in UTF-8 bytes after rendering.
// `node --check` is syntax only: the runtime (cloudfront-js-2.0) is exercised by 03-website.sh's test-function on
// DEVELOPMENT before it publishes.
// Usage: node scripts/check-edge.ts [domain]   (Node >= 24, from any directory)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

// Keep in sync with DOMAIN in the ops repo's infra/scripts/lib-website.sh.
const domain = process.argv[2] ?? 'iorgadragos.ro';
const LIMIT = 10 * 1024;
const PLACEHOLDER = /__[A-Z][A-Z0-9_]*__/;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// CHECK_EDGE_FN overrides the source for the script's own tests only; ignored in CI so the gate always checks edge/.
const fnPath = (!process.env.CI && process.env.CHECK_EDGE_FN) || join(root, 'edge/rewrite.js');

const fail = (errors: string[]) => {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
};
let src: string;
try {
  src = readFileSync(fnPath, 'utf8');
} catch (e) {
  fail([`cannot read ${fnPath}: ${(e as Error).message}`]);
}
src = src!;
const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'); // without `//` comment lines
const rendered = src.replaceAll('__DOMAIN__', domain);
const errors: string[] = [];
if (!code.includes('__DOMAIN__')) errors.push('no __DOMAIN__ placeholder in the code (the infra script renders it)');
const left = rendered.match(PLACEHOLDER);
if (left) errors.push(`unrendered placeholder left: ${left[0]}`);
if (!/^function handler\(event\)/m.test(rendered)) errors.push('no top-level `function handler(event)` (the CloudFront entry point)');
const bytes = Buffer.byteLength(rendered, 'utf8');
if (bytes > LIMIT) errors.push(`rendered function is ${bytes} bytes; CloudFront Functions allow ${LIMIT}`);

const dir = mkdtempSync(join(tmpdir(), 'edge-'));
try {
  const file = join(dir, 'rewrite.cjs');
  writeFileSync(file, rendered);
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) errors.push(`node --check failed:\n${r.stderr}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (errors.length) fail(errors);
console.log(`✓ edge/rewrite.js rendered for ${domain}: parses, ${bytes} bytes (limit ${LIMIT})`);
