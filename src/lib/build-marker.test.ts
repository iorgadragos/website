import { describe, expect, it } from 'vitest';
import { buildMarker } from './build-marker';

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
