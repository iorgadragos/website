import { describe, expect, it } from 'vitest';
import { isSet } from '../consts';

describe('isSet', () => {
  it('hides placeholders and keeps real values', () => {
    expect(isSet('https://www.linkedin.com/in/TODO')).toBe(false);
    expect(isSet('TODO-F40/xxxx/yyyy')).toBe(false);
    expect(isSet('https://github.com/iorgadragos')).toBe(true);
  });
});
