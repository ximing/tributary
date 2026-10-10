import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('accepts the original password and rejects a different one', async () => {
    const stored = await hashPassword('correct-horse');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct-horse', stored)).toBe(true);
    expect(await verifyPassword('wrong-horse', stored)).toBe(false);
    expect(await verifyPassword('correct-horse', 'plain')).toBe(false);
  });
});
