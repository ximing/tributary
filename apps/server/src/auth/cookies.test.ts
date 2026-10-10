import { describe, expect, it } from 'vitest';
import { readSessionToken, SESSION_COOKIE } from './cookies.js';

describe('session cookie', () => {
  it('reads the session token among other cookies', () => {
    expect(readSessionToken(`theme=dark; ${SESSION_COOKIE}=abc.def; extra=1`)).toBe('abc.def');
    expect(readSessionToken('theme=dark')).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
  });
});
