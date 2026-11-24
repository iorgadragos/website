// Checks the CloudFront Function source as it will be published (iorgadragos/website#14):
// render edge/rewrite.js the way studio/hq/infra/scripts/03-website.sh does (__DOMAIN__ → the domain), then
//   - no placeholder is left,
//   - `node --check` parses it (a syntax error would otherwise surface only at update-function time),
//   - it fits CloudFront Functions' 10 KB code-size limit.
// Usage: node scripts/check-edge.ts [domain]   (default iorgadragos.ro; Node >= 24, from any directory)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const domain = process.argv[2] ?? 'iorgadragos.ro';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// CHECK_EDGE_FN overrides the source for the script's own tests only; ignored in CI so the gate always checks edge/.
const fnPath = (!process.env.CI && process.env.CHECK_EDGE_FN) || join(root, 'edge/rewrite.js');
const src = readFileSync(fnPath, 'utf8');
const rendered = src.replaceAll('__DOMAIN__', domain);
const errors: string[] = [];
if (!src.includes('__DOMAIN__')) errors.push('edge/rewrite.js has no __DOMAIN__ placeholder (the infra script renders it)');
if (/__[A-Z]+__/.test(rendered)) errors.push(`unrendered placeholder left: ${rendered.match(/__[A-Z]+__/)![0]}`);
const bytes = Buffer.byteLength(rendered, 'utf8');
if (bytes > 10 * 1024) errors.push(`rendered function is ${bytes} bytes; CloudFront Functions allow 10240`);

const dir = mkdtempSync(join(tmpdir(), 'edge-'));
try {
  const file = join(dir, 'rewrite.js');
  writeFileSync(file, rendered);
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) errors.push(`node --check failed:\n${r.stderr}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ edge/rewrite.js rendered for ${domain}: parses, ${bytes} bytes (limit 10240)`);
