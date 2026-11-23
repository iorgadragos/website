import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const h = JSON.parse(readFileSync(join(__dirname, 'security-headers.json'), 'utf8'));
const csp = Object.fromEntries(
  (h.contentSecurityPolicy as string).split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [k, ...v] = d.split(/\s+/);
    return [k, v];
  }),
);

describe('security headers (data for the CloudFront response-headers policy)', () => {
  it('HSTS: 1 year, subdomains, preload', () => {
    expect(h.strictTransportSecurity).toEqual({ maxAgeSeconds: 31536000, includeSubdomains: true, preload: true });
  });
  it('no framing, no sniffing, strict referrer', () => {
    expect(h.frameOptions).toBe('DENY');
    expect(h.contentTypeOptions).toBe(true);
    expect(h.referrerPolicy).toBe('strict-origin-when-cross-origin');
  });
  it('CSP: self-only scripts (no inline/eval), no third parties, no framing', () => {
    expect(csp['default-src']).toEqual(["'self'"]);
    expect(csp['script-src']).toEqual(["'self'"]);
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'self'"]);
    // Allow-list every source token: no hosts (with or without scheme), no wildcards, no eval;
    // 'unsafe-inline' only for styles (Astro inlines CSS).
    for (const [k, v] of Object.entries(csp)) {
      for (const src of v as string[]) {
        const allowed = ["'self'", "'none'", 'data:', ...(k === 'style-src' ? ["'unsafe-inline'"] : [])];
        expect(allowed, `${k} token ${src}`).toContain(src);
      }
    }
  });

  it('every header overrides the origin (Override=true in the policy)', () => {
    expect(h.override).toBe(true);
  });
  it('locks down powerful browser features', () => {
    expect(h.customHeaders['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
  });
});
