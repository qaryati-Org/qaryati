import { escapeLike } from './escape-like';

describe('escapeLike', () => {
  it('escapes LIKE wildcards and backslashes', () => {
    expect(escapeLike('100%_a\\b')).toBe('100\\%\\_a\\\\b');
  });

  it('leaves normal text unchanged', () => {
    expect(escapeLike('برقة')).toBe('برقة');
  });
});
