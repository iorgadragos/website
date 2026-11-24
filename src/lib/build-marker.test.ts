import { describe, expect, it } from 'vitest';
import { buildMarker, checkMarker } from './build-marker';

describe('build marker', () => {
  it('is "dev" without BUILD_SHA', () => {
    expect(buildMarker(undefined)).toBe('dev');
    expect(buildMarker('')).toBe('dev');
  });
  it('is the full commit SHA', () => {
    const sha = 'a'.repeat(40);
    expect(buildMarker(sha)).toBe(sha);
  });
  it.each([
    'abc123', 'abc1234', 'a'.repeat(39), 'a'.repeat(41), `x${'a'.repeat(40)}`, 'A'.repeat(40), 'g'.repeat(40), `${'a'.repeat(40)}\n`,
  ])('rejects a malformed SHA %j', (s) => {
    expect(() => buildMarker(s)).toThrow(/BUILD_SHA/);
  });
});

describe('checkMarker (the dist gate)', () => {
  const sha = 'a'.repeat(40);
  it('accepts a SHA, and dev outside CI', () => {
    expect(checkMarker(`${sha}\n`, undefined, false)).toEqual([]);
    expect(checkMarker(`${sha}\n`, sha, true)).toEqual([]);
    expect(checkMarker('dev\n', undefined, false)).toEqual([]);
  });
  it('rejects a missing file', () => expect(checkMarker(null, undefined, false)[0]).toContain('missing or not a file'));
  it.each(['', '\n', 'dev', 'xdev\n', 'abc\n', sha, `${'a'.repeat(41)}\n`, `${'A'.repeat(40)}\n`, `${sha}\n\n`])('rejects malformed %j', (c) => {
    expect(checkMarker(c, undefined, false)[0]).toContain('malformed');
  });
  it('rejects a marker that is not BUILD_SHA', () => {
    expect(checkMarker(`${sha}\n`, 'b'.repeat(40), false)[0]).toContain('but BUILD_SHA is');
    expect(checkMarker('dev\n', sha, false)[0]).toContain('but BUILD_SHA is');
  });
  it('rejects dev in CI (BUILD_SHA was not set)', () => {
    expect(checkMarker('dev\n', undefined, true)[0]).toContain('"dev" in CI');
  });
});
